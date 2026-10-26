"""Server backup exporter bot (`bot/export_bot.py`).

1. Reads the bot token from the `CHAT_BACKUP_BOT_TOKEN` process environment variable
   and never hardcodes credentials or relies on external `.env` files.
2. Collects active threads (`channel.threads`) and archived public and private
   threads (`channel.archived_threads(limit=None)`), deduplicating by thread ID.
3. Exports messages in chronological order (`oldest_first=True`).
4. Serializes embeds as native JSON objects (`e.to_dict()`) instead of Python
   `repr` strings, and records `edited_timestamp`, `reply_to_id`, `category`,
   and `position`.
5. Skips re-downloading existing non-empty attachment files on disk; downloads
   go to a `.part` file that is renamed only when complete.
6. Skips channels and threads the bot cannot read instead of aborting, runs one
   export at a time, writes the export JSON atomically, and never overwrites an
   existing export (a second export on the same day gets a `<date>_<HHMMSS>` label).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import aiofiles
import discord
from discord.ext import commands


def load_token_from_env() -> str:
    """Resolve `CHAT_BACKUP_BOT_TOKEN` from process environment variables."""
    token = os.environ.get("CHAT_BACKUP_BOT_TOKEN", "").strip()
    if token:
        return token

    raise RuntimeError(
        "Missing bot token. Configure your Export Bot Token in Settings (Ctrl+,) "
        "or set the CHAT_BACKUP_BOT_TOKEN environment variable."
    )


def create_bot() -> commands.Bot:
    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    return commands.Bot(command_prefix="!", intents=intents)


bot = create_bot()
export_lock = asyncio.Lock()


def resolve_export_label(history_dir: Path, now: datetime) -> str:
    """Return the backup label for a new export, never reusing a finished export's label."""
    date_str = now.strftime("%Y-%m-%d")
    if (history_dir / date_str / f"server_export_{date_str}.json").exists():
        return f"{date_str}_{now.strftime('%H%M%S')}"
    return date_str


async def notify(ctx: commands.Context[Any], text: str) -> None:
    """Reply in the server; a missing send permission must not abort the export."""
    try:
        await ctx.send(text)
    except discord.HTTPException:
        pass


async def collect_all_channel_threads(
    channel: discord.ForumChannel | discord.TextChannel,
) -> list[discord.Thread]:
    """Return active + archived threads for a channel, deduplicated by thread ID."""
    by_id: dict[int, discord.Thread] = {}

    for thread in getattr(channel, "threads", []):
        by_id[thread.id] = thread

    # Forum posts are always public; text channels also have private threads.
    archive_kinds = [False, True] if isinstance(channel, discord.TextChannel) else [False]
    for private in archive_kinds:
        try:
            if private:
                archived = channel.archived_threads(limit=None, private=True)
            else:
                archived = channel.archived_threads(limit=None)
            async for thread in archived:
                by_id[thread.id] = thread
        except discord.Forbidden:
            pass

    return sorted(by_id.values(), key=lambda t: t.id)


async def download_attachment(att: discord.Attachment, dest_path: Path) -> None:
    """Download to `<name>.part` and rename, so a partial file never looks complete."""
    if dest_path.is_file() and dest_path.stat().st_size > 0:
        return
    part_path = dest_path.with_name(dest_path.name + ".part")
    await att.save(part_path)
    os.replace(part_path, dest_path)


async def process_message(
    message: discord.Message,
    assets_dir: Path,
    label: str,
) -> dict[str, Any]:
    """Download new attachments incrementally and serialize a message dict."""
    attachments_paths: list[str] = []

    for att in message.attachments:
        safe_name = f"{att.id}_{att.filename}"
        await download_attachment(att, assets_dir / safe_name)
        attachments_paths.append(f"assets_{label}/{safe_name}")

    reply_to_id: str | None = None
    if message.reference and message.reference.message_id:
        reply_to_id = str(message.reference.message_id)

    edited_iso: str | None = (
        message.edited_at.isoformat() if message.edited_at else None
    )

    msg_dict: dict[str, Any] = {
        "id": str(message.id),
        "type": "message",
        "author": {
            "id": str(message.author.id),
            "name": getattr(message.author, "name", str(message.author)),
            "bot": bool(message.author.bot),
        },
        "content": message.content or "",
        "timestamp": message.created_at.isoformat(),
        "attachments": attachments_paths,
        "embeds": [e.to_dict() for e in message.embeds],
    }
    if edited_iso:
        msg_dict["edited_timestamp"] = edited_iso
    if reply_to_id:
        msg_dict["reply_to_id"] = reply_to_id

    return msg_dict


async def process_thread(
    thread: discord.Thread,
    assets_dir: Path,
    label: str,
) -> dict[str, Any]:
    applied_tags_data = [
        {
            "id": str(tag.id),
            "name": tag.name,
            "moderated": bool(getattr(tag, "moderated", False)),
            "emoji": str(tag.emoji) if getattr(tag, "emoji", None) else None,
        }
        for tag in getattr(thread, "applied_tags", [])
    ]

    messages: list[dict[str, Any]] = []
    async for message in thread.history(limit=None, oldest_first=True):
        messages.append(await process_message(message, assets_dir, label))

    return {
        "id": str(thread.id),
        "parent_id": str(thread.parent_id) if thread.parent_id else None,
        "name": thread.name,
        "type": "thread",
        "applied_tags": applied_tags_data,
        "messages": messages,
    }


async def process_threads(
    threads: list[discord.Thread],
    assets_dir: Path,
    label: str,
    skipped: list[str],
) -> list[dict[str, Any]]:
    """Export each thread, skipping (and recording) the ones the bot cannot read."""
    posts: list[dict[str, Any]] = []
    for thread in threads:
        try:
            posts.append(await process_thread(thread, assets_dir, label))
        except discord.Forbidden:
            skipped.append(f"thread {thread.name}")
            print(f"[EXPORT_PROGRESS] Skipped thread {thread.name} (no access)", flush=True)
    return posts


async def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    """Write to a temporary file and rename, so readers never see a partial export."""
    tmp_path = path.with_name(path.name + ".tmp")
    async with aiofiles.open(tmp_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp_path, path)


async def run_export(ctx: commands.Context[Any], guild: discord.Guild) -> None:
    history_dir = Path(os.environ.get("CHAT_BACKUP_HISTORY_DIR", "history"))
    label = resolve_export_label(history_dir, datetime.now())
    export_dir = history_dir / label
    export_file = export_dir / f"server_export_{label}.json"
    assets_dir = export_dir / f"assets_{label}"

    print(f"[EXPORT_PROGRESS] Starting export for {guild.name} ({label})…", flush=True)
    await notify(ctx, f"Starting full server export for `{label}`…")

    assets_dir.mkdir(parents=True, exist_ok=True)

    server_data: dict[str, Any] = {
        "id": str(guild.id),
        "name": guild.name,
        "schema_version": 2,
        "channels": [],
    }
    skipped: list[str] = []

    sorted_channels = sorted(
        guild.channels,
        key=lambda c: (getattr(c, "position", 0), c.id),
    )

    for channel in sorted_channels:
        category_name = channel.category.name if getattr(channel, "category", None) else None
        position = int(getattr(channel, "position", 0))

        if isinstance(channel, discord.ForumChannel):
            print(f"[EXPORT_PROGRESS] Exporting forum #{channel.name}…", flush=True)
            available_tags = [
                {
                    "id": str(tag.id),
                    "name": tag.name,
                    "moderated": bool(tag.moderated),
                    "emoji": str(tag.emoji) if tag.emoji else None,
                }
                for tag in channel.available_tags
            ]

            threads = await collect_all_channel_threads(channel)
            posts = await process_threads(threads, assets_dir, label, skipped)

            server_data["channels"].append(
                {
                    "id": str(channel.id),
                    "name": channel.name,
                    "type": "forum",
                    "category": category_name,
                    "position": position,
                    "available_tags": available_tags,
                    "posts": posts,
                }
            )

        elif isinstance(channel, discord.TextChannel):
            print(f"[EXPORT_PROGRESS] Exporting channel #{channel.name}…", flush=True)
            direct_messages: list[dict[str, Any]] = []
            try:
                async for message in channel.history(limit=None, oldest_first=True):
                    direct_messages.append(
                        await process_message(message, assets_dir, label)
                    )
            except discord.Forbidden:
                skipped.append(f"#{channel.name}")
                print(f"[EXPORT_PROGRESS] Skipped #{channel.name} (no access)", flush=True)
                continue

            text_posts: list[dict[str, Any]] = []
            if direct_messages:
                text_posts.append(
                    {
                        "id": f"{channel.id}_main",
                        "parent_id": str(channel.id),
                        "name": f"#{channel.name}",
                        "type": "channel_stream",
                        "applied_tags": [],
                        "messages": direct_messages,
                    }
                )

            threads = await collect_all_channel_threads(channel)
            text_posts.extend(await process_threads(threads, assets_dir, label, skipped))

            server_data["channels"].append(
                {
                    "id": str(channel.id),
                    "name": channel.name,
                    "type": "text",
                    "category": category_name,
                    "position": position,
                    "available_tags": [],
                    "posts": text_posts,
                }
            )

    await write_json_atomic(export_file, server_data)

    print(f"[EXPORT_COMPLETE] Saved to {export_file}", flush=True)
    summary = f"Export complete. Saved to `{export_file}` and `{assets_dir}/`."
    if skipped:
        summary += f" Skipped (no access): {', '.join(skipped)}."
    await notify(ctx, summary)


@bot.event
async def on_ready() -> None:
    print(f"Logged in as {bot.user}", flush=True)


@bot.command()
@commands.guild_only()
@commands.has_guild_permissions(manage_guild=True)
async def export(ctx: commands.Context[Any]) -> None:
    if ctx.guild is None:
        return
    if export_lock.locked():
        await notify(ctx, "An export is already running; wait for it to finish.")
        return

    async with export_lock:
        try:
            await run_export(ctx, ctx.guild)
        except Exception as exc:  # report every failure to the desktop app
            print(f"[EXPORT_FAILED] {type(exc).__name__}: {exc}", flush=True)
            await notify(ctx, f"Export failed: {exc}")


@export.error
async def export_error(ctx: commands.Context[Any], error: commands.CommandError) -> None:
    if isinstance(error, commands.NoPrivateMessage):
        await notify(ctx, "`!export` can only be used in a server.")
    elif isinstance(error, commands.MissingPermissions):
        await notify(ctx, "`!export` requires the Manage Server permission.")
    else:
        print(f"[EXPORT_FAILED] {error}", flush=True)
        await notify(ctx, f"Export failed: {error}")


def main() -> None:
    try:
        token = load_token_from_env()
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    bot.run(token)


if __name__ == "__main__":
    main()
