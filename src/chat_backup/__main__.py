"""Allow running the package via python -m chat_backup."""

from __future__ import annotations

from chat_backup.app import main

if __name__ == "__main__":
    raise SystemExit(main())
