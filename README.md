# ChatServerBackup

A local desktop mirror and non-destructive editor for exported **Discord** server backups, built with **Tauri v2 (Rust + React 19 / TypeScript + Tailwind CSS)**, paired with a companion **Discord export bot** (`bot/export_bot.py`).

> **Platform support:** ChatServerBackup is currently tailored exclusively for **Discord** servers and only works with backups produced by the included Discord exporter bot.

## Requirements

- **Windows 10 or 11 (64-bit).** The app is a single `ChatServerBackup.exe`; no installer.
- **Microsoft Edge WebView2 Runtime.** Built into Windows 11 and current Windows 10; otherwise install the Evergreen runtime from Microsoft. The app draws its window, plays media and shows PDFs through it.
- **For exporting only** (browsing existing backups needs none of this):
  - **Python 3.13**, available as `python` on your `PATH`.
  - The Python packages **`discord.py`** and **`aiofiles`**: `python -m pip install discord.py aiofiles`.
  - A **Discord bot** you control, with its token (see below).

## Intended Usage & How It Works (User Path)

ChatServerBackup lets you keep a complete, offline copy of your Discord server—including text channels, forum channels, tags, threads, embeds, and all uploaded files—and continue reading, searching, or updating that archive locally on your computer without needing Discord or an internet connection.

1. **Install the app:**
   - Download `ChatServerBackup-v<version>-win64.zip` from the latest GitHub release (check it against `SHA256SUMS.txt` if you like) and unzip it to any folder, e.g. `D:\ServerBackup\`.
   - Backups are kept in a `history\` folder next to `ChatServerBackup.exe`; you can point the app at another folder later. Settings (backup folder, bot token, local author) are stored in `%LOCALAPPDATA%\ChatServerBackup\settings.json`, never next to your backups.
2. **Create the Discord bot (once):**
   - In the Discord Developer Portal, create an application, add a bot, and turn on the **Message Content** privileged intent.
   - Invite the bot to your server with permission to **View Channels**, **Read Message History** and **Send Messages** (it replies with progress), and give it access to every channel you want in the backup. Channels the bot cannot read are skipped and listed when the export finishes.
   - Copy the bot token and paste it in the app under **Settings** (`Ctrl+,`) → **Export bot token**. The token stays on your computer and is passed to the bot only when it starts.
3. **Export your server:**
   - Click **Start export bot** (the play button) in the status area at the bottom of the left sidebar and wait for **Connected**.
   - In any channel of your server, type `!export` (you need the **Manage Server** permission). The bot copies every text channel, forum channel, active and archived thread, message, embed and attachment into `history\<YYYY-MM-DD>\server_export_<YYYY-MM-DD>.json` with an `assets_<YYYY-MM-DD>\` folder. A second export on the same day goes to its own `<YYYY-MM-DD>_<HHMMSS>` folder, so nothing is overwritten, and attachments already downloaded are skipped.
   - When the export completes, the app loads it automatically.
4. **Browse and search offline:**
   - Pick a backup in the **Snapshot** selector, click through channels, sort and filter posts (forum tags with Any / All), search everything with `Ctrl+K`, and follow internal jump links between channels and threads (`Alt+←` / `Alt+→` to go back and forward).
   - Images, audio, video, PDFs, Word documents (`.docx`), code and text files, and `.zip` / `.7z` archives preview inside the app; any file can be opened in its default program or shown in Explorer.
   - To use another backup folder, click the folder path at the bottom of the sidebar or change it in **Settings**.
5. **Edit or add to your archive safely (non-destructive):**
   - Post new messages, create forum posts and threads, attach local files (by entering the file's path), and edit or delete existing messages.
   - Changes stay in memory until you click **Save** or press **`Ctrl+S`**; closing the app without saving discards them, and switching backups first asks whether to save.
   - Your original export is **never modified**: saving writes a single `server_export_<date>_edited.json` (plus `assets_<date>_edited\` for new files) next to it. Switch between **Original** and **Edited** in the Snapshot selector; while viewing the edited copy you can remove it with **Delete edited copy…**.

## Features
- **Tailored for Discord server structures:** Full support for Discord categories, text channels, forum channels, forum tag filtering (`Any` / `All`), active & archived threads, replies, and rich embeds.
- **Included Discord exporter bot (`bot/export_bot.py`):** Bundled inside the app and started from it; exports full server history in chronological order and incrementally downloads attachments so repeat exports skip already-downloaded files.
- **Rich media & document previews:** Markdown, syntax-highlighted code blocks, structured embeds, images with a zoomable lightbox, audio/video playback, PDF viewer, code/text files, `.docx` text, and `.zip` / `.7z` contents.
- **Non-destructive local editing:** Post new messages, attach local files, edit existing messages, and delete messages locally while keeping original exports strictly read-only.
- **Internal link navigation:** Jump directly between cross-referenced Discord channel/thread/message links with back/forward history.
- **Keyboard friendly:** `Ctrl+K` search, `Ctrl+F` search in post, `Ctrl+S` save, `Ctrl+,` settings, `Ctrl+B` / `Ctrl+Shift+B` hide panes.

## Building from source
Requires Node.js, a Rust toolchain (edition 2024) and the WebView2 runtime.

```
npm install
npm test
cargo test --manifest-path src-tauri/Cargo.toml
powershell -NoProfile -File packaging/build_release.ps1
```

The release script type-checks the frontend, builds the standalone exe, verifies it with `ChatServerBackup.exe --self-test` from a folder outside the repository, and writes the exe, zip and `SHA256SUMS.txt` to `dist/v<version>/`.
