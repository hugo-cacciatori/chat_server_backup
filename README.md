# ChatServerBackup

A local desktop mirror and non-destructive editor for exported chat server backups, built with **Tauri v2 (Rust + React 19 / TypeScript + Tailwind CSS)**.

## Features
- **Full-fidelity local browsing:** Navigate server channels, forum channels, tag filters, threads, and chronological message streams offline.
- **Rich media & document previews:** Inline rendering for markdown, syntax-highlighted code blocks, structured embeds, high-DPI images with zoomable lightbox, audio/video playback, PDF page reader, code/text files, Office documents, and archives.
- **Non-destructive local editing:** Post new messages, attach local files, edit existing messages, and delete messages locally. Original backup files and asset directories are never modified; edits are persisted to a separate `*_edited.json` snapshot.
- **Internal link navigation:** Jump directly between cross-referenced channels, posts, and messages with back/forward history.
