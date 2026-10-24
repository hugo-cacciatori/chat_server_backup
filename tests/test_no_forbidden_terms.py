"""Enforce Ground Rule 1 (no forbidden platform term outside bot/) and version consistency."""

from __future__ import annotations

import os
import tomllib
from pathlib import Path

from chat_backup import __version__

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN_TERM = "".join(["dis", "cord"])


def test_no_forbidden_term_in_codebase() -> None:
    """Verify the forbidden term never appears in src/, tests/, packaging/, README.md, or pyproject.toml."""
    checked_paths: list[Path] = [
        ROOT / "README.md",
        ROOT / "pyproject.toml",
        *sorted((ROOT / "src").rglob("*")),
        *sorted((ROOT / "tests").rglob("*")),
        *sorted((ROOT / "packaging").rglob("*")),
    ]
    violations: list[str] = []
    for path in checked_paths:
        if not path.is_file() or "__pycache__" in path.parts or path.suffix in {".pyc", ".png", ".ico"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore").lower()
        if FORBIDDEN_TERM in text:
            violations.append(str(path.relative_to(ROOT)))

    assert not violations, f"Forbidden term found in: {violations}"


def test_version_matches_pyproject() -> None:
    """Verify chat_backup.__version__ matches pyproject.toml version."""
    pyproject_data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert __version__ == pyproject_data["project"]["version"]


def test_offscreen_platform_enforced() -> None:
    """Verify tests always run with QT_QPA_PLATFORM=offscreen."""
    assert os.environ.get("QT_QPA_PLATFORM") == "offscreen"
