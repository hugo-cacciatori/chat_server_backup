"""Main entry point for ChatServerBackup."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication, QLabel, QMainWindow, QVBoxLayout, QWidget

from chat_backup import __version__
from chat_backup.core.loader import discover_backups, load_backup
from chat_backup.settings import load_settings


class MainWindow(QMainWindow):
    """Application main window (expanded into the full 3-pane viewer/editor in Milestone 2)."""

    def __init__(self, backup_root: Path | None = None) -> None:
        super().__init__()
        self.setWindowTitle(f"ChatServerBackup v{__version__}")
        self.resize(1200, 780)

        settings = load_settings()
        self.backup_root = backup_root if backup_root is not None else settings.resolved_backup_root()
        self.descriptors = discover_backups(self.backup_root)

        central = QWidget(self)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(24, 24, 24, 24)

        summary = (
            f"ChatServerBackup v{__version__}\n"
            f"Backup folder: {self.backup_root}\n"
            f"Discovered snapshots: {len(self.descriptors)}"
        )
        self.status_label = QLabel(summary, central)
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.status_label)
        self.setCentralWidget(central)


def build_arg_parser() -> argparse.ArgumentParser:
    """Create the command-line argument parser."""
    parser = argparse.ArgumentParser(prog="chat-backup", description="Local chat server backup viewer and editor")
    parser.add_argument("--version", action="store_true", help="Print version and exit")
    parser.add_argument("--backup-dir", type=Path, default=None, help="Path to the history/ backup directory")
    parser.add_argument(
        "--verify-backup",
        type=Path,
        default=None,
        help="Validate a backup JSON file headlessly and print channel/message counts",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run the application or CLI verification command."""
    args = build_arg_parser().parse_args(argv)
    if args.version:
        print(f"ChatServerBackup {__version__}")
        return 0

    if args.verify_backup is not None:
        backup = load_backup(args.verify_backup)
        total_posts = sum(len(ch.posts) for ch in backup.channels)
        total_msgs = sum(len(p.messages) for ch in backup.channels for p in ch.posts)
        print(
            f"Verified '{backup.name}' ({backup.date_label}): "
            f"{len(backup.channels)} channel(s), {total_posts} post(s), {total_msgs} message(s)"
        )
        return 0

    app = QApplication.instance() or QApplication(sys.argv if argv is None else ["chat-backup", *argv])
    window = MainWindow(backup_root=args.backup_dir)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
