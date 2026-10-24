# ChatServerBackup

A local desktop mirror and non-destructive editor for exported **Discord** server backups, built with **Tauri v2 (Rust + React 19 / TypeScript + Tailwind CSS)**, paired with a companion **Discord export bot** (`bot/export_bot.py`).

> **Platform support:** ChatServerBackup is currently tailored exclusively for **Discord** servers and only works with backups produced by the included Discord exporter bot.

## Intended Usage & How It Works (User Path)

ChatServerBackup lets you keep a complete, offline copy of your Discord server—including text channels, forum channels, tags, threads, embeds, and all uploaded files—and continue reading, searching, or updating that archive locally on your computer without needing Discord or an internet connection.

1. **Export your Discord server with the built-in bot:**
   - Invite your Discord bot to the server you want to back up and enter your bot token inside the desktop app's **Settings** (`Ctrl+,` → **Export Bot Token**).
   - Click **Start Bot** in the desktop app's left sidebar (wait for the status indicator to turn green: **Connected**), and type `!export` in any channel on your Discord server.
   - The embedded exporter bot crawls every text channel, forum channel, active thread, and archived thread, downloading all messages, embeds, and file attachments into `history/<YYYY-MM-DD>/server_export_<YYYY-MM-DD>.json` alongside an `assets_<YYYY-MM-DD>/` folder, and the desktop app automatically loads the finished export.
2. **Browse and search offline in the desktop app:**
   - Launch the **ChatServerBackup** desktop app. It automatically detects your `history/` folder, or you can switch folders with one click using the **Browse…** button right above the Snapshot selector or in the **Settings** modal (`Ctrl+,`, which also remembers your recent backup folders).
   - Pick a backup date from the top bar, click through channels, filter forum posts by tags, use global search (`Ctrl+K`), follow internal jump links across channels/threads, and view images, audio, video, PDFs, Office docs (`.docx`), code files, and archives (`.zip`/`.7z`) directly inside the app.
3. **Edit or add to your archive safely (non-destructive):**
   - You can post new messages, create new forum threads, attach local files from your PC, or edit/delete existing messages inside the desktop app to keep taking notes or organizing your archive offline.
   - Changes stay in memory during your session until you explicitly click **Save** or press **`Ctrl+S`** (closing the app without saving discards unsaved changes).
   - Your original Discord export is **never modified**—when you save (`Ctrl+S`), changes are written to a single `server_export_<date>_edited.json` file alongside the original. You can switch between `Original` and `Edited`, save additional changes into `Edited`, or click **Delete Edited Backup** at any time.

## Features
- **Tailored for Discord server structures:** Full support for Discord categories, text channels, forum channels, forum tag filtering (`ANY` / `ALL`), active & archived threads, replies, and rich embeds.
- **Included Discord exporter bot (`bot/export_bot.py`):** Exports full server history in chronological order and incrementally downloads attachments so repeat exports skip already-downloaded files.
- **Rich media & document previews:** Inline rendering for markdown, syntax-highlighted code blocks, structured embeds, high-DPI images with zoomable lightbox, audio/video playback, PDF page reader, code/text files, Office documents, and archives.
- **Non-destructive local editing:** Post new messages, attach local files, edit existing messages, and delete messages locally while keeping original exports strictly read-only.
- **Internal link navigation:** Jump directly between cross-referenced Discord channel/thread/message links with back/forward history.
