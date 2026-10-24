"""Build the local release executable and zip bundle into dist/v<version>/ with SHA-256 checksums."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from chat_backup import __version__  # noqa: E402


def sha256_file(path: Path) -> str:
    """Compute the SHA-256 hex digest of a file."""
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(65536):
            digest.update(chunk)
    return digest.hexdigest()


def zip_directory(source_dir: Path, zip_path: Path) -> None:
    """Create a deterministic zip archive of source_dir."""
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in sorted(source_dir.rglob("*")):
            if item.is_file():
                arcname = item.relative_to(source_dir.parent)
                zf.write(item, arcname)


def build_local_release() -> Path:
    """Run PyInstaller and package the local release under dist/v<version>/."""
    version = __version__
    release_dir = ROOT / "dist" / f"v{version}"
    work_dir = ROOT / "build" / "pyinstaller"
    spec_file = ROOT / "packaging" / "chat_backup.spec"

    if release_dir.exists():
        shutil.rmtree(release_dir)
    release_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--distpath",
        str(release_dir),
        "--workpath",
        str(work_dir),
        str(spec_file),
    ]
    subprocess.run(cmd, check=True, cwd=str(ROOT))

    app_folder = release_dir / "ChatServerBackup"
    exe_path = app_folder / "ChatServerBackup.exe"
    if not exe_path.is_file():
        raise FileNotFoundError(f"Expected built executable not found at {exe_path}")

    zip_path = release_dir / f"ChatServerBackup-v{version}-win64.zip"
    zip_directory(app_folder, zip_path)

    checksums_path = release_dir / "SHA256SUMS.txt"
    lines = [
        f"{sha256_file(zip_path)}  {zip_path.name}",
        f"{sha256_file(exe_path)}  ChatServerBackup/{exe_path.name}",
    ]
    checksums_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Clean intermediate PyInstaller build folder automatically
    if work_dir.exists():
        shutil.rmtree(work_dir)

    print(f"Local release built at: {release_dir}")
    print(f"  Zip: {zip_path}")
    print(f"  Checksums: {checksums_path}")
    return release_dir


if __name__ == "__main__":
    build_local_release()
