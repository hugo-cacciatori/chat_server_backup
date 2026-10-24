"""Pure Python data model for server backups, channels, posts/threads, and messages."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

ChannelType = Literal["forum", "text"]
PostType = Literal["thread", "channel_stream"]
EditState = Literal["original", "added", "edited"]


@dataclass(slots=True)
class Author:
    """Message author metadata."""

    id: str
    name: str
    bot: bool = False


@dataclass(slots=True)
class ForumTag:
    """Tag definition or applied tag on a forum post."""

    id: str
    name: str
    moderated: bool = False
    emoji: str | None = None


@dataclass(slots=True)
class AttachmentRef:
    """Reference to an attachment stored in assets_<date>/ or assets_<date>_edited/."""

    relative_path: str
    filename: str
    resolved_path: Path | None = None

    @property
    def extension(self) -> str:
        """Lowercase file extension without leading dot."""
        suffix = Path(self.filename).suffix.lower()
        return suffix[1:] if suffix.startswith(".") else suffix

    @property
    def exists(self) -> bool:
        """Whether the resolved file exists on disk."""
        return self.resolved_path is not None and self.resolved_path.is_file()


@dataclass(slots=True)
class EmbedField:
    """A single key/value field inside a rich embed."""

    name: str
    value: str
    inline: bool = False


@dataclass(slots=True)
class EmbedData:
    """Normalized representation of a message embed (supporting legacy stringified dicts and JSON dicts)."""

    title: str = ""
    description: str = ""
    url: str = ""
    color: int | None = None
    author_name: str = ""
    footer_text: str = ""
    image_url: str = ""
    thumbnail_url: str = ""
    fields: list[EmbedField] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Message:
    """A single chat message inside a post, thread, or text channel stream."""

    id: str
    author: Author
    content: str
    timestamp: str
    attachments: list[AttachmentRef] = field(default_factory=list)
    embeds: list[EmbedData] = field(default_factory=list)
    edited_timestamp: str | None = None
    reply_to_id: str | None = None
    local_edit_state: EditState = "original"


@dataclass(slots=True)
class PostOrThread:
    """A forum post, a child thread, or a text channel's main message stream."""

    id: str
    parent_id: str | None
    name: str
    type: PostType = "thread"
    applied_tags: list[ForumTag] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)


@dataclass(slots=True)
class Channel:
    """A server forum channel or text channel."""

    id: str
    name: str
    type: ChannelType
    available_tags: list[ForumTag] = field(default_factory=list)
    posts: list[PostOrThread] = field(default_factory=list)
    category: str | None = None
    position: int = 0


@dataclass(slots=True, frozen=True)
class BackupDescriptor:
    """Summary entry for a discovered original or edited backup file in history/."""

    date_label: str
    json_path: Path
    is_edited: bool
    display_label: str
    based_on_filename: str


@dataclass(slots=True)
class ServerBackup:
    """Complete loaded server backup in memory."""

    id: str
    name: str
    date_label: str
    source_path: Path
    original_source_path: Path
    is_edited: bool
    based_on_export: str
    last_modified_at: str | None = None
    schema_version: int = 1
    channels: list[Channel] = field(default_factory=list)

    @property
    def backup_dir(self) -> Path:
        """Directory containing this backup JSON and its asset folders."""
        return self.source_path.parent
