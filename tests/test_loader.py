"""Tests for backup discovery, legacy v1 normalization, embed parsing, and path safety."""

from __future__ import annotations

from pathlib import Path

from chat_backup.core.loader import discover_backups, load_backup, parse_embed, resolve_attachment

ROOT = Path(__file__).resolve().parent.parent


def test_discover_and_load_v1_backup(sample_history_dir: Path) -> None:
    """Verify v1 backup discovery, chronological sorting, text channel stream grouping, and embed parsing."""
    descriptors = discover_backups(sample_history_dir)
    assert len(descriptors) == 1
    desc = descriptors[0]
    assert desc.date_label == "2026-10-20"
    assert not desc.is_edited
    assert desc.display_label == "2026-10-20 (Original)"

    backup = load_backup(desc.json_path)
    assert backup.name == "Engineering Archive"
    assert not backup.is_edited
    assert len(backup.channels) == 2

    # Forum channel check: messages sorted chronologically (2001 then 2002)
    forum = backup.channels[0]
    assert forum.type == "forum"
    assert len(forum.available_tags) == 2
    assert len(forum.posts) == 1
    post = forum.posts[0]
    assert [m.id for m in post.messages] == ["2001", "2002"]

    # Attachment resolution check
    att_img = post.messages[0].attachments[0]
    assert att_img.exists
    assert att_img.extension == "png"
    assert att_img.filename == "1001_diagram.png"

    # Legacy stringified embed normalization check
    embed = post.messages[1].embeds[0]
    assert embed.title == "Reference Document"
    assert embed.description == "Summary of the architecture"
    assert embed.author_name == "Spec Author"
    assert embed.footer_text == "Footer note"
    assert len(embed.fields) == 1
    assert embed.fields[0].name == "Section"

    # Text channel check: direct messages grouped into primary stream before child threads
    text_ch = backup.channels[1]
    assert text_ch.type == "text"
    assert len(text_ch.posts) == 2
    main_stream = text_ch.posts[0]
    assert main_stream.type == "channel_stream"
    assert [m.id for m in main_stream.messages] == ["3001", "3002"]
    child_thread = text_ch.posts[1]
    assert child_thread.id == "thread_400"
    assert len(child_thread.messages) == 1


def test_path_traversal_blocked(sample_history_dir: Path) -> None:
    """Verify resolve_attachment rejects '..' traversal and absolute drive paths."""
    backup_dir = sample_history_dir / "2026-10-20"
    ref_traversal = resolve_attachment("../../secret.txt", backup_dir, "2026-10-20")
    assert ref_traversal.resolved_path is None

    ref_drive = resolve_attachment("C:/Windows/System32/cmd.exe", backup_dir, "2026-10-20")
    assert ref_drive.resolved_path is None


def test_parse_embed_fallbacks() -> None:
    """Verify parse_embed handles plain non-dict strings and structured JSON dicts."""
    plain = parse_embed(" plain embed note ")
    assert plain.description == " plain embed note "

    structured = parse_embed({"title": "Direct Dict", "color": 12345})
    assert structured.title == "Direct Dict"
    assert structured.color == 12345


def test_reference_backup_loads_if_present() -> None:
    """If the local reference backup is present on disk, verify it loads cleanly with all assets resolved."""
    ref_json = ROOT / "reference" / "history" / "2026-10-20" / "server_export_2026-10-20.json"
    if not ref_json.is_file():
        return

    backup = load_backup(ref_json)
    assert backup.id == "1175623460161065030"
    assert len(backup.channels) >= 1
    forum = backup.channels[0]
    assert forum.type == "forum"
    assert len(forum.available_tags) == 8
    all_attachments = [att for p in forum.posts for m in p.messages for att in m.attachments]
    assert len(all_attachments) >= 38
    assert all(att.exists for att in all_attachments)
