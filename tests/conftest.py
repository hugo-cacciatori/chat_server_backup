"""Pytest configuration enforcing offscreen Qt execution and providing backup fixtures."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# Enforce offscreen rendering before any PySide6 module is imported
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest  # noqa: E402


@pytest.fixture
def sample_history_dir(tmp_path: Path) -> Path:
    """Create a realistic v1 backup directory with a forum channel, a text channel, and assets."""
    history_dir = tmp_path / "history"
    date_dir = history_dir / "2026-10-20"
    assets_dir = date_dir / "assets_2026-10-20"
    assets_dir.mkdir(parents=True)

    img_file = assets_dir / "1001_diagram.png"
    img_file.write_bytes(b"\x89PNG\r\n\x1a\nsample-image-bytes")

    txt_file = assets_dir / "1002_notes.txt"
    txt_file.write_text("Line 1\nLine 2\n", encoding="utf-8")

    legacy_embed_repr = repr(
        {
            "title": "Reference Document",
            "description": "Summary of the architecture",
            "url": "https://example.org/spec",
            "color": 5793266,
            "author": {"name": "Spec Author"},
            "footer": {"text": "Footer note"},
            "fields": [{"name": "Section", "value": "Storage", "inline": True}],
        }
    )

    export_payload: dict[str, Any] = {
        "id": "999000111",
        "name": "Engineering Archive",
        "channels": [
            {
                "id": "ch_forum_1",
                "name": "knowledge-base",
                "type": "forum",
                "available_tags": [
                    {"id": "tag_docs", "name": "docs", "moderated": False, "emoji": "📄"},
                    {"id": "tag_audio", "name": "audio", "moderated": False, "emoji": None},
                ],
                "posts": [
                    {
                        "id": "post_100",
                        "parent_id": "ch_forum_1",
                        "name": "System notes",
                        "type": "thread",
                        "applied_tags": [{"id": "tag_docs", "name": "docs", "emoji": "📄"}],
                        "messages": [
                            {
                                "id": "2002",
                                "type": "message",
                                "author": {"id": "u1", "name": "alice", "bot": False},
                                "content": "Second message chronologically (exported first by legacy bot)",
                                "timestamp": "2026-10-20T12:05:00+00:00",
                                "attachments": ["assets_2026-10-20/1002_notes.txt"],
                                "embeds": [legacy_embed_repr],
                            },
                            {
                                "id": "2001",
                                "type": "message",
                                "author": {"id": "u1", "name": "alice", "bot": False},
                                "content": "First message chronologically",
                                "timestamp": "2026-10-20T12:00:00+00:00",
                                "attachments": ["assets_2026-10-20/1001_diagram.png"],
                                "embeds": [],
                            },
                        ],
                    }
                ],
            },
            {
                "id": "ch_text_1",
                "name": "general-chat",
                "type": "text",
                "posts": [
                    {
                        "id": "3002",
                        "type": "message",
                        "author": {"id": "u2", "name": "bob", "bot": False},
                        "content": "Later message in general",
                        "timestamp": "2026-10-20T13:10:00+00:00",
                        "attachments": [],
                        "embeds": [],
                    },
                    {
                        "id": "3001",
                        "type": "message",
                        "author": {"id": "u1", "name": "alice", "bot": False},
                        "content": "Earlier message in general",
                        "timestamp": "2026-10-20T13:00:00+00:00",
                        "attachments": [],
                        "embeds": [],
                    },
                    {
                        "id": "thread_400",
                        "parent_id": "ch_text_1",
                        "name": "Side discussion",
                        "type": "thread",
                        "applied_tags": [],
                        "messages": [
                            {
                                "id": "4001",
                                "type": "message",
                                "author": {"id": "u2", "name": "bob", "bot": False},
                                "content": "Inside child thread",
                                "timestamp": "2026-10-20T13:15:00+00:00",
                                "attachments": [],
                                "embeds": [],
                            }
                        ],
                    },
                ],
            },
        ],
    }

    export_file = date_dir / "server_export_2026-10-20.json"
    export_file.write_text(json.dumps(export_payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return history_dir
