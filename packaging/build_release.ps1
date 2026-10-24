$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

$PkgJson = Get-Content "$Root\package.json" -Raw | ConvertFrom-Json
$Version = $PkgJson.version

# Ensure src-tauri/icons/icon.ico and icon.png exist for Tauri Windows resource compiler
$IconsDir = "$Root\src-tauri\icons"
if (-not (Test-Path "$IconsDir\icon.ico")) {
    New-Item -ItemType Directory -Force -Path $IconsDir | Out-Null
    python -c "from PIL import Image, ImageDraw; img = Image.new('RGBA', (256, 256), (30, 41, 59, 255)); d = ImageDraw.Draw(img); d.rounded_rectangle([32, 32, 224, 224], radius=40, fill=(99, 102, 241, 255)); d.rectangle([72, 88, 184, 112], fill=(255, 255, 255, 255)); d.rectangle([72, 132, 156, 156], fill=(224, 231, 255, 255)); img.save(r'$IconsDir\icon.png'); img.save(r'$IconsDir\icon.ico', sizes=[(256, 256), (64, 64), (32, 32), (16, 16)])"
}

Write-Output "Building frontend (Vite + React 19 + TypeScript)..."
npm run build

Write-Output "Building native Rust Tauri v2 release binary..."
cargo build --release --manifest-path "$Root\src-tauri\Cargo.toml"

$BuiltExe = "$Root\src-tauri\target\release\chat_server_backup.exe"
if (-not (Test-Path $BuiltExe)) {
    throw "Expected compiled executable not found at $BuiltExe"
}

$ReleaseDir = "$Root\dist\v$Version"
$AppDir = "$ReleaseDir\ChatServerBackup"
if (Test-Path $ReleaseDir) {
    Remove-Item -Recurse -Force $ReleaseDir
}
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

$DestExe = "$AppDir\ChatServerBackup.exe"
Copy-Item $BuiltExe $DestExe -Force

$ZipPath = "$ReleaseDir\ChatServerBackup-v$Version-win64.zip"
Compress-Archive -Path $AppDir -DestinationPath $ZipPath -Force

$ZipSha = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()
$ExeSha = (Get-FileHash -Path $DestExe -Algorithm SHA256).Hash.ToLower()

$ChecksumsPath = "$ReleaseDir\SHA256SUMS.txt"
"$ZipSha  ChatServerBackup-v$Version-win64.zip`n$ExeSha  ChatServerBackup/ChatServerBackup.exe`n" | Set-Content -Path $ChecksumsPath -NoNewline -Encoding UTF8

Write-Output "Local release built at: $ReleaseDir"
Write-Output "  Executable: $DestExe ($([math]::Round((Get-Item $DestExe).Length / 1MB, 2)) MiB)"
Write-Output "  Zip: $ZipPath"
Write-Output "  Checksums: $ChecksumsPath"
