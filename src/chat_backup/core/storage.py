"""Copy-on-write local editing and persistence engine with strict immutability guards."""

from __future__ import annotations

import json
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from chat_backup.core.loader import base_export_stem
from chat_backup.core.model import (
    AttachmentRef,
    Author,
    Channel,
    EmbedData,
    ForumTag,
    Message,
    PostOrThread,
    ServerBackup,
)


class ImmutableBackupError(RuntimeError):
    """Raised when an operation attempts to modify or overwrite an original backup file or asset directory."""


def is_original_backup_path(path: Path) -> bool:
    """Return True if the path does not have an '_edited' marker in its filename stem."""
    return "_edited" not in path.stem


def get_edited_backup_path(
    source_path: Path,
    new_revision: bool = False,
    now: datetime | None = None,
) -> Path:
    """Compute the target file path for saving an edited version of a backup.

    - When ``new_revision=False`` (default), returns the rolling edited file:
      ``server_export_<date>_edited.json``.
    - When ``new_revision=True``, returns a timestamped snapshot:
      ``server_export_<date>_edited_<YYYY-MM-DD_HHMMSS>.json``.
    """
    parent = source_path.resolve().parent
    orig_stem = base_export_stem(source_path)
    if new_revision:
        ts = (now or datetime.now(UTC)).strftime("%Y-%m-%d_%H%M%S")
        return parent / f"{orig_stem}_edited_{ts}.json"
    return parent / f"{orig_stem}_edited.json"


def get_edited_assets_dir(backup: ServerBackup) -> Path:
    """Return the isolated directory for locally attached files: assets_<date>_edited/."""
    return backup.backup_dir / f"assets_{backup.date_label}_edited"


def _generate_local_id() -> str:
    """Generate a monotonic numeric ID string for locally created posts, messages, and attachments."""
    return str(time.time_ns())


def _find_channel(backup: ServerBackup, channel_id: str) -> Channel:
    for ch in backup.channels:
        if ch.id == channel_id:
            return ch
    raise KeyError(f"Channel not found: {channel_id}")


def _find_post(backup: ServerBackup, channel_id: str, post_id: str) -> PostOrThread:
    ch = _find_channel(backup, channel_id)
    for post in ch.posts:
        if post.id == post_id:
            return post
    raise KeyError(f"Post/thread not found: {post_id} in channel {channel_id}")


def stage_local_attachment(backup: ServerBackup, source_file: Path) -> AttachmentRef:
    """Copy a local file into assets_<date>_edited/ (never touching original assets_<date>/)."""
    src = source_file.resolve()
    if not src.is_file():
        raise FileNotFoundError(f"Attachment source file does not exist: {src}")

    edited_assets = get_edited_assets_dir(backup).resolve()
    original_assets = (backup.backup_dir / f"assets_{backup.date_label}").resolve()
    if edited_assets == original_assets:
        raise ImmutableBackupError("Edited assets directory cannot equal the original assets directory.")

    edited_assets.mkdir(parents=True, exist_ok=True)
    safe_name = f"{_generate_local_id()}_{src.name}"
    dest = edited_assets / safe_name
    shutil.copy2(src, dest)
    rel_path = f"{edited_assets.name}/{safe_name}"
    return AttachmentRef(relative_path=rel_path, filename=safe_name, resolved_path=dest)


def add_message(
    backup: ServerBackup,
    channel_id: str,
    post_id: str,
    author: Author,
    content: str,
    attachment_files: list[Path] | tuple[Path, ...] = (),
    reply_to_id: str | None = None,
    now: datetime | None = None,
) -> Message:
    """Append a new local message to a post/thread in memory."""
    post = _find_post(backup, channel_id, post_id)
    ts = (now or datetime.now(UTC)).isoformat()
    attachments = [stage_local_attachment(backup, f) for f in attachment_files]
    msg = Message(
        id=_generate_local_id(),
        author=author,
        content=content,
        timestamp=ts,
        attachments=attachments,
        embeds=[],
        edited_timestamp=None,
        reply_to_id=reply_to_id,
        local_edit_state="added",
    )
    post.messages.append(msg)
    return msg


def edit_message(
    backup: ServerBackup,
    channel_id: str,
    post_id: str,
    message_id: str,
    new_content: str,
    new_attachment_files: list[Path] | tuple[Path, ...] = (),
    keep_attachments: list[AttachmentRef] | None = None,
    now: datetime | None = None,
) -> Message:
    """Edit an existing message's content and/or attachments in memory."""
    post = _find_post(backup, channel_id, post_id)
    for msg in post.messages:
        if msg.id == message_id:
            msg.content = new_content
            msg.edited_timestamp = (now or datetime.now(UTC)).isoformat()
            if msg.local_edit_state == "original":
                msg.local_edit_state = "edited"
            if keep_attachments is not None:
                msg.attachments = list(keep_attachments)
            for f in new_attachment_files:
                msg.attachments.append(stage_local_attachment(backup, f))
            return msg
    raise KeyError(f"Message not found: {message_id} in post {post_id}")


def delete_message(
    backup: ServerBackup,
    channel_id: str,
    post_id: str,
    message_id: str,
) -> bool:
    """Delete a message from a post/thread in memory (original asset files on disk are never deleted)."""
    post = _find_post(backup, channel_id, post_id)
    for idx, msg in enumerate(post.messages):
        if msg.id == message_id:
            del post.messages[idx]
            return True
    return False


def create_post(
    backup: ServerBackup,
    channel_id: str,
    title: str,
    author: Author,
    initial_content: str,
    tag_ids: list[str] | tuple[str, ...] = (),
    attachment_files: list[Path] | tuple[Path, ...] = (),
    now: datetime | None = None,
) -> PostOrThread:
    """Create a new forum post or thread with a starter message in memory."""
    ch = _find_channel(backup, channel_id)
    tag_map = {t.id: t for t in ch.available_tags}
    applied_tags = [tag_map[tid] for tid in tag_ids if tid in tag_map]

    post_id = _generate_local_id()
    new_post = PostOrThread(
        id=post_id,
        parent_id=ch.id,
        name=title,
        type="thread",
        applied_tags=applied_tags,
        messages=[],
    )
    ch.posts.append(new_post)
    add_message(
        backup=backup,
        channel_id=channel_id,
        post_id=post_id,
        author=author,
        content=initial_content,
        attachment_files=attachment_files,
        now=now,
    )
    return new_post


def _serialize_tag(tag: ForumTag, include_moderated: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": tag.id,
        "name": tag.name,
        "emoji": tag.emoji,
    }
    if include_moderated:
        data["moderated"] = tag.moderated
    return data


def _serialize_embed(embed: EmbedData) -> dict[str, Any]:
    if embed.raw and "_raw_text" not in embed.raw:
        return dict(embed.raw)
    result: dict[str, Any] = {}
    if embed.title:
        result["title"] = embed.title
    if embed.description:
        result["description"] = embed.description
    if embed.url:
        result["url"] = embed.url
    if embed.color is not None:
        result["color"] = embed.color
    if embed.author_name:
        result["author"] = {"name": embed.author_name}
    if embed.footer_text:
        result["footer"] = {"text": embed.footer_text}
    if embed.image_url:
        result["image"] = {"url": embed.image_url}
    if embed.thumbnail_url:
        result["thumbnail"] = {"url": embed.thumbnail_url}
    if embed.fields:
        result["fields"] = [{"name": f.name, "value": f.value, "inline": f.inline} for f in embed.fields]
    return result


def _serialize_message(msg: Message) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": msg.id,
        "type": "message",
        "author": {
            "id": msg.author.id,
            "name": msg.author.name,
            "bot": msg.author.bot,
        },
        "content": msg.content,
        "timestamp": msg.timestamp,
        "attachments": [att.relative_path for att in msg.attachments],
        "embeds": [_serialize_embed(e) for e in msg.embeds],
    }
    if msg.edited_timestamp:
        data["edited_timestamp"] = msg.edited_timestamp
    if msg.reply_to_id:
        data["reply_to_id"] = msg.reply_to_id
    if msg.local_edit_state != "original":
        data["local_edit_state"] = msg.local_edit_state
    return data


def _serialize_post(post: PostOrThread) -> dict[str, Any]:
    return {
        "id": post.id,
        "parent_id": post.parent_id,
        "name": post.name,
        "type": post.type,
        "applied_tags": [_serialize_tag(t, include_moderated=False) for t in post.applied_tags],
        "messages": [_serialize_message(m) for m in post.messages],
    }


def serialize_backup(backup: ServerBackup, last_modified_at: str) -> dict[str, Any]:
    """Convert a ServerBackup into a JSON-serializable dictionary."""
    channels_out: list[dict[str, Any]] = []
    for ch in backup.channels:
        ch_dict: dict[str, Any] = {
            "id": ch.id,
            "name": ch.name,
            "type": ch.type,
        }
        if ch.category:
            ch_dict["category"] = ch.category
        if ch.position:
            ch_dict["position"] = ch.position
        if ch.type == "forum" or ch.available_tags:
            ch_dict["available_tags"] = [_serialize_tag(t, include_moderated=True) for t in ch.available_tags]
        ch_dict["posts"] = [_serialize_post(p) for p in ch.posts]
        channels_out.append(ch_dict)

    return {
        "id": backup.id,
        "name": backup.name,
        "schema_version": 2,
        "based_on_export": backup.based_on_export,
        "last_modified_at": last_modified_at,
        "channels": channels_out,
    }


def save_edited_backup(
    backup: ServerBackup,
    target_path: Path | None = None,
    new_revision: bool = False,
    now: datetime | None = None,
) -> Path:
    """Save the backup to an edited backup file, strictly refusing to overwrite any original backup."""
    dest = (
        target_path.resolve()
        if target_path is not None
        else get_edited_backup_path(backup.source_path, new_revision=new_revision, now=now)
    )

    if dest == backup.original_source_path.resolve() or is_original_backup_path(dest):
        raise ImmutableBackupError(
            f"Refusing to overwrite original or non-edited backup path: {dest}"
        )

    modified_iso = (now or datetime.now(UTC)).isoformat()
    payload = serialize_backup(backup, last_modified_at=modified_iso)

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    backup.source_path = dest
    backup.is_edited = True
    backup.last_modified_at = modified_iso
    backup.schema_version = 2
    return dest
