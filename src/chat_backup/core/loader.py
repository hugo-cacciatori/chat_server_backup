"""Backup discovery, JSON parsing, legacy normalization, and safe asset path resolution."""

from __future__ import annotations

import ast
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from chat_backup.core.model import (
    AttachmentRef,
    Author,
    BackupDescriptor,
    Channel,
    ChannelType,
    EditState,
    EmbedData,
    EmbedField,
    ForumTag,
    Message,
    PostOrThread,
    PostType,
    ServerBackup,
)

_EXPORT_PREFIX = "server_export_"
_EDITED_MARKER = "_edited"


def extract_date_label(json_path: Path) -> str:
    """Extract the date label (e.g. '2026-10-20') from a backup file or its parent folder."""
    stem = json_path.stem
    if stem.startswith(_EXPORT_PREFIX):
        rest = stem[len(_EXPORT_PREFIX) :]
        idx = rest.find(_EDITED_MARKER)
        return rest[:idx] if idx != -1 else rest
    return json_path.parent.name


def base_export_stem(json_path: Path) -> str:
    """Return the original export stem without any '_edited...' suffix."""
    stem = json_path.stem
    idx = stem.find(_EDITED_MARKER)
    return stem[:idx] if idx != -1 else stem


def discover_backups(history_dir: Path) -> list[BackupDescriptor]:
    """Scan a history directory for dated folders and return original + edited backup descriptors."""
    if not history_dir.is_dir():
        return []

    date_dirs = sorted(
        (d for d in history_dir.iterdir() if d.is_dir()),
        key=lambda d: d.name,
        reverse=True,
    )

    descriptors: list[BackupDescriptor] = []
    for date_dir in date_dirs:
        date_label = date_dir.name
        json_files = sorted(date_dir.glob("server_export_*.json"), key=lambda p: p.name)
        originals = [p for p in json_files if _EDITED_MARKER not in p.stem]
        editeds = [p for p in json_files if _EDITED_MARKER in p.stem]

        for orig in originals:
            descriptors.append(
                BackupDescriptor(
                    date_label=date_label,
                    json_path=orig,
                    is_edited=False,
                    display_label=f"{date_label} (Original)",
                    based_on_filename=orig.name,
                )
            )
        for ed in editeds:
            base_name = f"{base_export_stem(ed)}.json"
            suffix = ed.stem[len(base_export_stem(ed)) :]
            if suffix == _EDITED_MARKER:
                label = f"{date_label} (Edited)"
            else:
                rev = suffix.removeprefix(f"{_EDITED_MARKER}_")
                label = f"{date_label} (Edited {rev})"
            descriptors.append(
                BackupDescriptor(
                    date_label=date_label,
                    json_path=ed,
                    is_edited=True,
                    display_label=label,
                    based_on_filename=base_name,
                )
            )
    return descriptors


def parse_embed(raw_embed: object) -> EmbedData:
    """Normalize either a structured embed dict or a legacy Python-repr string into EmbedData."""
    parsed_dict: dict[str, Any] | None = None
    if isinstance(raw_embed, dict):
        parsed_dict = raw_embed
    elif isinstance(raw_embed, str):
        text = raw_embed.strip()
        if text.startswith("{") and text.endswith("}"):
            try:
                candidate = json.loads(text)
                if isinstance(candidate, dict):
                    parsed_dict = candidate
            except ValueError:
                pass
            if parsed_dict is None:
                try:
                    candidate = ast.literal_eval(text)
                    if isinstance(candidate, dict):
                        parsed_dict = candidate
                except (ValueError, SyntaxError):
                    pass
        if parsed_dict is None:
            return EmbedData(description=raw_embed, raw={"_raw_text": raw_embed})
    else:
        return EmbedData(description=str(raw_embed))

    title = str(parsed_dict.get("title") or "")
    description = str(parsed_dict.get("description") or "")
    url = str(parsed_dict.get("url") or "")
    raw_color = parsed_dict.get("color")
    color = int(raw_color) if isinstance(raw_color, int) else None

    author_obj = parsed_dict.get("author")
    author_name = str(author_obj.get("name") or "") if isinstance(author_obj, dict) else ""

    footer_obj = parsed_dict.get("footer")
    footer_text = str(footer_obj.get("text") or "") if isinstance(footer_obj, dict) else ""

    image_obj = parsed_dict.get("image")
    image_url = str(image_obj.get("url") or "") if isinstance(image_obj, dict) else ""

    thumb_obj = parsed_dict.get("thumbnail")
    thumbnail_url = str(thumb_obj.get("url") or "") if isinstance(thumb_obj, dict) else ""

    fields: list[EmbedField] = []
    raw_fields = parsed_dict.get("fields")
    if isinstance(raw_fields, list):
        for item in raw_fields:
            if isinstance(item, dict):
                fields.append(
                    EmbedField(
                        name=str(item.get("name") or ""),
                        value=str(item.get("value") or ""),
                        inline=bool(item.get("inline", False)),
                    )
                )

    return EmbedData(
        title=title,
        description=description,
        url=url,
        color=color,
        author_name=author_name,
        footer_text=footer_text,
        image_url=image_url,
        thumbnail_url=thumbnail_url,
        fields=fields,
        raw=parsed_dict,
    )


def resolve_attachment(raw_entry: object, backup_dir: Path, date_label: str) -> AttachmentRef:
    """Resolve an attachment path safely inside backup_dir without allowing path traversal."""
    if isinstance(raw_entry, dict):
        raw_str = str(raw_entry.get("relative_path") or raw_entry.get("path") or raw_entry.get("filename") or "")
    else:
        raw_str = str(raw_entry)

    normalized = raw_str.replace("\\", "/").strip("/")
    parts = [p for p in normalized.split("/") if p and p != "."]
    if not parts or any(p == ".." for p in parts) or ":" in normalized:
        safe_name = Path(normalized).name.replace("..", "") or "attachment"
        return AttachmentRef(relative_path=safe_name, filename=safe_name, resolved_path=None)

    filename = parts[-1]
    rel_path = "/".join(parts)
    backup_root = backup_dir.resolve()

    candidates = [
        backup_dir / Path(*parts),
        backup_dir / f"assets_{date_label}_edited" / filename,
        backup_dir / f"assets_{date_label}" / filename,
    ]
    resolved_target: Path | None = None
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            resolved.relative_to(backup_root)
        except ValueError:
            continue
        if resolved.is_file():
            resolved_target = resolved
            break

    if resolved_target is None:
        default_candidate = (backup_dir / Path(*parts)).resolve()
        try:
            default_candidate.relative_to(backup_root)
            resolved_target = default_candidate
        except ValueError:
            resolved_target = None

    return AttachmentRef(relative_path=rel_path, filename=filename, resolved_path=resolved_target)


def _message_sort_key(msg: Message) -> tuple[float, int, str]:
    """Chronological sort key: (timestamp_epoch, numeric_id, raw_id)."""
    ts_val = 0.0
    if msg.timestamp:
        try:
            ts_val = datetime.fromisoformat(msg.timestamp).timestamp()
        except ValueError:
            ts_val = 0.0
    num_id = int(msg.id) if re.fullmatch(r"\d+", msg.id) else 0
    return (ts_val, num_id, msg.id)


def _parse_tag(raw_tag: dict[str, Any]) -> ForumTag:
    emoji_val = raw_tag.get("emoji")
    return ForumTag(
        id=str(raw_tag.get("id") or ""),
        name=str(raw_tag.get("name") or ""),
        moderated=bool(raw_tag.get("moderated", False)),
        emoji=str(emoji_val) if emoji_val is not None else None,
    )


def _parse_message(raw_msg: dict[str, Any], backup_dir: Path, date_label: str) -> Message:
    raw_author = raw_msg.get("author")
    if isinstance(raw_author, dict):
        author = Author(
            id=str(raw_author.get("id") or ""),
            name=str(raw_author.get("name") or "Unknown"),
            bot=bool(raw_author.get("bot", False)),
        )
    else:
        author = Author(id="", name="Unknown", bot=False)

    raw_attachments = raw_msg.get("attachments")
    attachments = (
        [resolve_attachment(a, backup_dir, date_label) for a in raw_attachments]
        if isinstance(raw_attachments, list)
        else []
    )

    raw_embeds = raw_msg.get("embeds")
    embeds = [parse_embed(e) for e in raw_embeds] if isinstance(raw_embeds, list) else []

    raw_state = str(raw_msg.get("local_edit_state") or "original")
    edit_state: EditState = raw_state if raw_state in ("original", "added", "edited") else "original"

    edited_ts = raw_msg.get("edited_timestamp")
    reply_to = raw_msg.get("reply_to_id")

    return Message(
        id=str(raw_msg.get("id") or ""),
        author=author,
        content=str(raw_msg.get("content") or ""),
        timestamp=str(raw_msg.get("timestamp") or ""),
        attachments=attachments,
        embeds=embeds,
        edited_timestamp=str(edited_ts) if edited_ts else None,
        reply_to_id=str(reply_to) if reply_to else None,
        local_edit_state=edit_state,
    )


def _parse_post_or_thread(
    raw_post: dict[str, Any],
    backup_dir: Path,
    date_label: str,
    sort_chronological: bool,
) -> PostOrThread:
    raw_tags = raw_post.get("applied_tags")
    applied_tags = [_parse_tag(t) for t in raw_tags if isinstance(t, dict)] if isinstance(raw_tags, list) else []

    raw_messages = raw_post.get("messages")
    messages = (
        [_parse_message(m, backup_dir, date_label) for m in raw_messages if isinstance(m, dict)]
        if isinstance(raw_messages, list)
        else []
    )
    if sort_chronological:
        messages.sort(key=_message_sort_key)

    raw_type = str(raw_post.get("type") or "thread")
    post_type: PostType = "channel_stream" if raw_type == "channel_stream" else "thread"
    parent_id = raw_post.get("parent_id")

    return PostOrThread(
        id=str(raw_post.get("id") or ""),
        parent_id=str(parent_id) if parent_id is not None else None,
        name=str(raw_post.get("name") or "Untitled"),
        type=post_type,
        applied_tags=applied_tags,
        messages=messages,
    )


def load_backup(json_path: Path, sort_chronological: bool = True) -> ServerBackup:
    """Load and normalize a v1 or v2 server export JSON file into a ServerBackup instance."""
    resolved_json = json_path.resolve()
    raw_data = json.loads(resolved_json.read_text(encoding="utf-8"))
    if not isinstance(raw_data, dict):
        raise ValueError(f"Expected JSON object at root of {resolved_json}")

    backup_dir = resolved_json.parent
    date_label = extract_date_label(resolved_json)
    orig_stem = base_export_stem(resolved_json)
    original_source_path = backup_dir / f"{orig_stem}.json"
    is_edited = _EDITED_MARKER in resolved_json.stem or bool(raw_data.get("based_on_export"))
    based_on = str(raw_data.get("based_on_export") or original_source_path.name)
    last_mod = raw_data.get("last_modified_at")
    schema_version = int(raw_data.get("schema_version") or 1)

    channels: list[Channel] = []
    raw_channels = raw_data.get("channels")
    if isinstance(raw_channels, list):
        for raw_ch in raw_channels:
            if not isinstance(raw_ch, dict):
                continue
            ch_id = str(raw_ch.get("id") or "")
            ch_name = str(raw_ch.get("name") or "unnamed")
            raw_ch_type = str(raw_ch.get("type") or "text")
            ch_type: ChannelType = "forum" if raw_ch_type == "forum" else "text"

            raw_avail_tags = raw_ch.get("available_tags")
            available_tags = (
                [_parse_tag(t) for t in raw_avail_tags if isinstance(t, dict)]
                if isinstance(raw_avail_tags, list)
                else []
            )

            posts: list[PostOrThread] = []
            direct_messages: list[Message] = []
            raw_posts = raw_ch.get("posts")
            if isinstance(raw_posts, list):
                for item in raw_posts:
                    if not isinstance(item, dict):
                        continue
                    if item.get("type") == "message" and "messages" not in item:
                        direct_messages.append(_parse_message(item, backup_dir, date_label))
                    else:
                        posts.append(_parse_post_or_thread(item, backup_dir, date_label, sort_chronological))

            if direct_messages:
                if sort_chronological:
                    direct_messages.sort(key=_message_sort_key)
                main_stream = PostOrThread(
                    id=f"{ch_id}_main",
                    parent_id=ch_id,
                    name=f"# {ch_name} (Main)",
                    type="channel_stream",
                    applied_tags=[],
                    messages=direct_messages,
                )
                posts.insert(0, main_stream)

            channels.append(
                Channel(
                    id=ch_id,
                    name=ch_name,
                    type=ch_type,
                    available_tags=available_tags,
                    posts=posts,
                    category=str(raw_ch["category"]) if raw_ch.get("category") else None,
                    position=int(raw_ch.get("position") or 0),
                )
            )

    return ServerBackup(
        id=str(raw_data.get("id") or ""),
        name=str(raw_data.get("name") or "Server Backup"),
        date_label=date_label,
        source_path=resolved_json,
        original_source_path=original_source_path.resolve(),
        is_edited=is_edited,
        based_on_export=based_on,
        last_modified_at=str(last_mod) if last_mod else None,
        schema_version=schema_version,
        channels=channels,
    )
