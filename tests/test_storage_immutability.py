"""Tests for local message/post creation, editing, deletion, and strict original-backup immutability."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

import pytest

from chat_backup.app import MainWindow, main
from chat_backup.core.loader import discover_backups, load_backup
from chat_backup.core.model import Author
from chat_backup.core.storage import (
    ImmutableBackupError,
    add_message,
    create_post,
    delete_message,
    edit_message,
    save_edited_backup,
)
from chat_backup.settings import AppSettings, load_settings, save_settings


def _snapshot_directory_hashes(directory: Path) -> dict[str, str]:
    """Compute SHA-256 digests of every file under directory."""
    hashes: dict[str, str] = {}
    for file_path in sorted(directory.rglob("*")):
        if file_path.is_file():
            rel = str(file_path.relative_to(directory)).replace("\\", "/")
            hashes[rel] = hashlib.sha256(file_path.read_bytes()).hexdigest()
    return hashes


def test_copy_on_write_editing_preserves_original_backup(sample_history_dir: Path, tmp_path: Path) -> None:
    """Verify posting, editing, deleting, and saving never modify the original JSON or assets folder."""
    date_dir = sample_history_dir / "2026-10-20"
    orig_json = date_dir / "server_export_2026-10-20.json"
    orig_assets_dir = date_dir / "assets_2026-10-20"

    orig_json_sha_before = hashlib.sha256(orig_json.read_bytes()).hexdigest()
    orig_assets_sha_before = _snapshot_directory_hashes(orig_assets_dir)

    backup = load_backup(orig_json)
    local_author = Author(id="u_local", name="local_editor", bot=False)

    # Create a new local attachment file outside the backup folder
    new_att_source = tmp_path / "added_snippet.py"
    new_att_source.write_text("print('hello backup')\n", encoding="utf-8")

    # 1. Post a new message with an attachment
    added_msg = add_message(
        backup=backup,
        channel_id="ch_forum_1",
        post_id="post_100",
        author=local_author,
        content="New local message with attachment",
        attachment_files=[new_att_source],
    )
    assert added_msg.local_edit_state == "added"
    assert len(added_msg.attachments) == 1
    assert added_msg.attachments[0].exists
    assert "assets_2026-10-20_edited" in added_msg.attachments[0].relative_path

    # 2. Edit an existing original message
    edited_msg = edit_message(
        backup=backup,
        channel_id="ch_forum_1",
        post_id="post_100",
        message_id="2001",
        new_content="First message chronologically (edited locally)",
    )
    assert edited_msg.local_edit_state == "edited"
    assert edited_msg.edited_timestamp is not None

    # 3. Delete an existing message ("2002")
    deleted = delete_message(
        backup=backup,
        channel_id="ch_forum_1",
        post_id="post_100",
        message_id="2002",
    )
    assert deleted is True

    # 4. Create a new forum post
    new_post = create_post(
        backup=backup,
        channel_id="ch_forum_1",
        title="New Local Forum Topic",
        author=local_author,
        initial_content="Starter body for the new topic",
        tag_ids=["tag_docs"],
    )
    assert len(new_post.messages) == 1
    assert new_post.applied_tags[0].id == "tag_docs"

    # 5. Guard check: attempting to save directly over the original JSON must raise ImmutableBackupError
    with pytest.raises(ImmutableBackupError):
        save_edited_backup(backup, target_path=orig_json)

    # 6. Save to the default rolling edited file: server_export_2026-10-20_edited.json
    fixed_now = datetime(2026, 10, 24, 14, 35, 0, tzinfo=UTC)
    edited_path = save_edited_backup(backup, new_revision=False, now=fixed_now)
    assert edited_path.name == "server_export_2026-10-20_edited.json"
    assert edited_path.is_file()

    # 7. Save an explicit timestamped revision snapshot
    rev_path = save_edited_backup(backup, new_revision=True, now=fixed_now)
    assert rev_path.name == "server_export_2026-10-20_edited_2026-10-24_143500.json"
    assert rev_path.is_file()

    # 8. Verify original backup JSON and original assets_<date>/ are 100% untouched byte-for-byte
    assert hashlib.sha256(orig_json.read_bytes()).hexdigest() == orig_json_sha_before
    assert _snapshot_directory_hashes(orig_assets_dir) == orig_assets_sha_before

    # 9. Reload the rolling edited backup and verify all edits round-tripped cleanly
    reloaded = load_backup(edited_path)
    assert reloaded.is_edited is True
    assert reloaded.based_on_export == "server_export_2026-10-20.json"
    forum_posts = reloaded.channels[0].posts
    assert len(forum_posts) == 2
    reloaded_post_100 = forum_posts[0]
    assert [m.id for m in reloaded_post_100.messages] == ["2001", added_msg.id]
    assert reloaded_post_100.messages[0].content == "First message chronologically (edited locally)"
    assert reloaded_post_100.messages[0].local_edit_state == "edited"
    assert reloaded_post_100.messages[1].local_edit_state == "added"
    assert reloaded_post_100.messages[1].attachments[0].exists

    # 10. Discover backups should now list Original, Edited, and Edited revision
    discovered = discover_backups(sample_history_dir)
    assert [d.display_label for d in discovered] == [
        "2026-10-20 (Original)",
        "2026-10-20 (Edited)",
        "2026-10-20 (Edited 2026-10-24_143500)",
    ]


def test_settings_persistence_and_offscreen_window(
    sample_history_dir: Path,
    tmp_path: Path,
    qtbot: pytest.FixtureRequest,
) -> None:
    """Verify settings round-trip and MainWindow initializes offscreen without displaying any window."""
    settings_path = tmp_path / "settings.json"
    cfg = AppSettings(backup_root=str(sample_history_dir), local_author_name="Hugo")
    save_settings(cfg, path=settings_path)
    loaded_cfg = load_settings(path=settings_path)
    assert loaded_cfg.local_author_name == "Hugo"
    assert loaded_cfg.resolved_backup_root() == sample_history_dir

    window = MainWindow(backup_root=sample_history_dir)
    assert len(window.descriptors) == 1
    window.close()

    # Also verify CLI flags (--version and --verify-backup)
    assert main(["--version"]) == 0
    orig_json = sample_history_dir / "2026-10-20" / "server_export_2026-10-20.json"
    assert main(["--verify-backup", str(orig_json)]) == 0
