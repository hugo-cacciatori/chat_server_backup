"""Application path resolution for settings, resources, and default backup directories."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def app_data_dir() -> Path:
    """Return the per-user application data directory (%LOCALAPPDATA%\\ChatServerBackup)."""
    base = os.environ.get("LOCALAPPDATA")
    if base:
        root = Path(base)
    else:
        root = Path.home() / "AppData" / "Local"
    target = root / "ChatServerBackup"
    target.mkdir(parents=True, exist_ok=True)
    return target


def settings_file_path() -> Path:
    """Return the path to settings.json."""
    return app_data_dir() / "settings.json"


def project_or_exe_root() -> Path:
    """Return the folder beside the executable (when frozen) or the repository root."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def default_history_dir(root: Path | None = None) -> Path:
    """Resolve the default history/ directory beside the app/repo, falling back to reference/history in dev."""
    base = root if root is not None else project_or_exe_root()
    primary = base / "history"
    if primary.is_dir():
        return primary
    dev_fallback = base / "reference" / "history"
    if dev_fallback.is_dir():
        return dev_fallback
    return primary
