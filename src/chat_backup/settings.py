"""Persistent user settings stored in %LOCALAPPDATA%\\ChatServerBackup\\settings.json."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from chat_backup.paths import default_history_dir, settings_file_path


@dataclass(slots=True)
class AppSettings:
    """User preferences persisted across sessions."""

    backup_root: str = ""
    local_author_name: str = "Local User"
    local_author_id: str = "local-user-1"

    def resolved_backup_root(self) -> Path:
        """Return the configured backup folder or the default history/ directory."""
        if self.backup_root:
            candidate = Path(self.backup_root)
            if candidate.exists():
                return candidate
        return default_history_dir()


def load_settings(path: Path | None = None) -> AppSettings:
    """Load settings from JSON on disk, returning defaults if missing or malformed."""
    target = path if path is not None else settings_file_path()
    if not target.is_file():
        return AppSettings()
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return AppSettings()
        return AppSettings(
            backup_root=str(raw.get("backup_root", "")),
            local_author_name=str(raw.get("local_author_name", "Local User")),
            local_author_id=str(raw.get("local_author_id", "local-user-1")),
        )
    except (OSError, ValueError, TypeError):
        return AppSettings()


def save_settings(settings: AppSettings, path: Path | None = None) -> Path:
    """Write settings atomically to JSON on disk."""
    target = path if path is not None else settings_file_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(asdict(settings), indent=2, ensure_ascii=False), encoding="utf-8")
    return target
