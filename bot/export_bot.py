"""Standalone server backup exporter bot (`bot/export_bot.py`).

Improvements over the initial prototype:
1. Reads the bot token from the `CHAT_BACKUP_BOT_TOKEN` environment variable
   (or a local `.env` file) and never hardcodes credentials.
2. Collects both active threads (`channel.threads`) and archived threads
   (`channel.archived_threads(limit=None)`), deduplicating by thread ID.
3. Exports messages in chronological order (`oldest_first=True`).
4. Serializes embeds as native JSON objects (`e.to_dict()`) instead of Python
   `repr` strings, and records `edited_timestamp`, `reply_to_id`, `category`,
   and `position`.
5. Skips re-downloading existing non-empty attachment files on disk.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import aiofiles
import discord
from discord.ext import commands


def load_token_from_env(env_file: Path | None = None) -> str:
    """Resolve `CHAT_BACKUP_BOT_TOKEN` (and optional `CHAT_BACKUP_HISTORY_DIR`) from environment or `.env` file."""
    token = os.environ.get("CHAT_BACKUP_BOT_TOKEN", "").strip()

    candidates = (
        [env_file]
        if env_file is not None
        else [Path(".env"), Path(__file__).resolve().parent / ".env"]
    )
    for candidate in candidates:
        if candidate.is_file():
            for raw_line in candidate.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                k = key.strip()
                cleaned = val.strip().strip("'").strip('"')
                if k == "CHAT_BACKUP_BOT_TOKEN" and cleaned and not token:
                    token = cleaned
                elif k == "CHAT_BACKUP_HISTORY_DIR" and cleaned and not os.environ.get("CHAT_BACKUP_HISTORY_DIR"):
                    os.environ["CHAT_BACKUP_HISTORY_DIR"] = cleaned

    if token:
        return token

    raise RuntimeError(
        "Missing bot token. Set the CHAT_BACKUP_BOT_TOKEN environment variable "
        "or add CHAT_BACKUP_BOT_TOKEN=<token> to a local .env file."
    )


def create_bot() -> commands.Bot:
    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    return commands.Bot(command_prefix="!", intents=intents)


bot = create_bot()


async def collect_all_channel_threads(
    channel: discord.ForumChannel | discord.TextChannel,
) -> list[discord.Thread]:
    """Return active + archived threads for a channel, deduplicated by thread ID."""
    by_id: dict[int, discord.Thread] = {}

    for thread in getattr(channel, "threads", []):
        by_id[thread.id] = thread

    if hasattr(channel, "archived_threads"):
        try:
            async for thread in channel.archived_threads(limit=None):
                by_id[thread.id] = thread
        except discord.Forbidden:
            pass

    return sorted(by_id.values(), key=lambda t: t.id)


async def process_message(
    message: discord.Message,
    assets_dir: Path,
    date_str: str,
) -> dict[str, Any]:
    """Download new attachments incrementally and serialize a message dict."""
    attachments_paths: list[str] = []

    for att in message.attachments:
        safe_name = f"{att.id}_{att.filename}"
        dest_path = assets_dir / safe_name

        # Incremental download: skip if already present and non-empty
        if not (dest_path.is_file() and dest_path.stat().st_size > 0):
            data = await att.read()
            async with aiofiles.open(dest_path, "wb") as f:
                await f.write(data)

        attachments_paths.append(f"assets_{date_str}/{safe_name}")

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
    date_str: str,
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
        msg_data = await process_message(message, assets_dir, date_str)
        messages.append(msg_data)

    return {
        "id": str(thread.id),
        "parent_id": str(thread.parent_id) if thread.parent_id else None,
        "name": thread.name,
        "type": "thread",
        "applied_tags": applied_tags_data,
        "messages": messages,
    }


@bot.event
async def on_ready() -> None:
    print(f"Logged in as {bot.user}")


@bot.command()
async def export(ctx: commands.Context[Any]) -> None:
    if not ctx.guild:
        await ctx.send("This command can only be used in a server.")
        return

    date_str = datetime.now().strftime("%Y-%m-%d")
    default_hist = (
        Path(__file__).resolve().parent / "history"
        if (Path(__file__).resolve().parent / "history").is_dir()
        else Path("history")
    )
    history_dir = Path(os.environ.get("CHAT_BACKUP_HISTORY_DIR", str(default_hist)))
    export_dir = history_dir / date_str
    export_file = export_dir / f"server_export_{date_str}.json"
    assets_dir = export_dir / f"assets_{date_str}"

    await ctx.send(f"Starting full server export for `{date_str}`…")

    export_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    server_data: dict[str, Any] = {
        "id": str(ctx.guild.id),
        "name": ctx.guild.name,
        "schema_version": 2,
        "channels": [],
    }

    sorted_channels = sorted(
        ctx.guild.channels,
        key=lambda c: (getattr(c, "position", 0), c.id),
    )

    for channel in sorted_channels:
        category_name = channel.category.name if getattr(channel, "category", None) else None
        position = int(getattr(channel, "position", 0))

        if isinstance(channel, discord.ForumChannel):
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
            posts = [
                await process_thread(thread, assets_dir, date_str)
                for thread in threads
            ]

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
            direct_messages: list[dict[str, Any]] = []
            async for message in channel.history(limit=None, oldest_first=True):
                direct_messages.append(
                    await process_message(message, assets_dir, date_str)
                )

            posts: list[dict[str, Any]] = []
            if direct_messages:
                posts.append(
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
            for thread in threads:
                posts.append(await process_thread(thread, assets_dir, date_str))

            server_data["channels"].append(
                {
                    "id": str(channel.id),
                    "name": channel.name,
                    "type": "text",
                    "category": category_name,
                    "position": position,
                    "available_tags": [],
                    "posts": posts,
                }
            )

    async with aiofiles.open(export_file, "w", encoding="utf-8") as f:
        await f.write(json.dumps(server_data, indent=2, ensure_ascii=False))

    await ctx.send(
        f"Export complete. Saved to `{export_file}` and `{assets_dir}/`."
    )


def main() -> None:
    try:
        token = load_token_from_env()
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    bot.run(token)


if __name__ == "__main__":
    main()
