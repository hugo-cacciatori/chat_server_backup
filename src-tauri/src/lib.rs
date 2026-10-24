pub mod loader;
pub mod model;
pub mod previews;
pub mod storage;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use loader::{discover_backups, load_backup};
use model::{Author, BackupDescriptor, ServerBackup};
use previews::{inspect_attachment_file, AttachmentInspection};
use serde::{Deserialize, Serialize};
use storage::{
    add_message, create_post, delete_edited_backup, delete_message, edit_message,
    save_edited_backup, save_session_backup,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMutationResult {
    pub backup: ServerBackup,
    pub saved_path: String,
    pub active_post_id: Option<String>,
    pub active_message_id: Option<String>,
}

fn current_local_author() -> Author {
    let cfg = load_app_settings_from(&settings_file_path());
    Author {
        id: if cfg.local_author_id.trim().is_empty() {
            default_author_id()
        } else {
            cfg.local_author_id
        },
        name: if cfg.local_author_name.trim().is_empty() {
            default_author_name()
        } else {
            cfg.local_author_name
        },
        bot: false,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub backup_root: String,
    #[serde(default)]
    pub recent_backup_roots: Vec<String>,
    #[serde(default = "default_author_name")]
    pub local_author_name: String,
    #[serde(default = "default_author_id")]
    pub local_author_id: String,
}

fn default_author_name() -> String {
    "Local User".to_string()
}

fn default_author_id() -> String {
    "local-user-1".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            backup_root: String::new(),
            recent_backup_roots: Vec::new(),
            local_author_name: default_author_name(),
            local_author_id: default_author_id(),
        }
    }
}

pub fn push_recent_backup_root(cfg: &mut AppSettings, new_root: &str) {
    let trimmed = new_root.trim();
    if trimmed.is_empty() {
        return;
    }
    cfg.recent_backup_roots
        .retain(|existing| !existing.eq_ignore_ascii_case(trimmed));
    cfg.recent_backup_roots.insert(0, trimmed.to_string());
    if cfg.recent_backup_roots.len() > 8 {
        cfg.recent_backup_roots.truncate(8);
    }
}

pub fn settings_file_path() -> PathBuf {
    let base = env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("ChatServerBackup").join("settings.json")
}

pub fn load_app_settings_from(path: &Path) -> AppSettings {
    if let Ok(raw) = fs::read_to_string(path) {
        if let Ok(parsed) = serde_json::from_str::<AppSettings>(&raw) {
            return parsed;
        }
    }
    AppSettings::default()
}

pub fn save_app_settings_to(settings: &AppSettings, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

pub fn default_history_dir() -> PathBuf {
    if let Ok(exe) = env::current_exe() {
        let mut cur = exe.parent();
        while let Some(dir) = cur {
            let direct = dir.join("history");
            if direct.is_dir() {
                return direct;
            }
            let dev_ref = dir.join("reference").join("history");
            if dev_ref.is_dir() {
                return dev_ref;
            }
            cur = dir.parent();
        }
    }
    if let Ok(cwd) = env::current_dir() {
        let mut cur = Some(cwd.as_path());
        while let Some(dir) = cur {
            let direct = dir.join("history");
            if direct.is_dir() {
                return direct;
            }
            let dev_ref = dir.join("reference").join("history");
            if dev_ref.is_dir() {
                return dev_ref;
            }
            cur = dir.parent();
        }
    }
    PathBuf::from("history")
}

#[tauri::command]
fn get_app_settings() -> AppSettings {
    let mut cfg = load_app_settings_from(&settings_file_path());
    if cfg.backup_root.is_empty() {
        cfg.backup_root = default_history_dir().to_string_lossy().to_string();
    }
    if !cfg.backup_root.is_empty() {
        let root_copy = cfg.backup_root.clone();
        push_recent_backup_root(&mut cfg, &root_copy);
    }
    cfg
}

#[tauri::command]
fn set_backup_root(backup_root: String) -> Result<Vec<BackupDescriptor>, String> {
    let s_path = settings_file_path();
    let mut cfg = load_app_settings_from(&s_path);
    let trimmed = backup_root.trim().to_string();
    cfg.backup_root = trimmed.clone();
    if !trimmed.is_empty() {
        push_recent_backup_root(&mut cfg, &trimmed);
    }
    save_app_settings_to(&cfg, &s_path)?;

    let dir = if cfg.backup_root.is_empty() {
        default_history_dir()
    } else {
        PathBuf::from(&cfg.backup_root)
    };
    Ok(discover_backups(&dir))
}

#[tauri::command]
fn remove_recent_backup_root(folder_path: String) -> Result<AppSettings, String> {
    let s_path = settings_file_path();
    let mut cfg = load_app_settings_from(&s_path);
    let trimmed = folder_path.trim();
    cfg.recent_backup_roots
        .retain(|existing| !existing.eq_ignore_ascii_case(trimmed));
    save_app_settings_to(&cfg, &s_path)?;
    if cfg.backup_root.is_empty() {
        cfg.backup_root = default_history_dir().to_string_lossy().to_string();
    }
    Ok(cfg)
}

#[tauri::command]
fn pick_backup_folder(initial_dir: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().set_title("Select Backup History Folder");
    let candidate = initial_dir
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            let cfg = load_app_settings_from(&settings_file_path());
            if !cfg.backup_root.is_empty() {
                Some(PathBuf::from(cfg.backup_root))
            } else {
                Some(default_history_dir())
            }
        });

    if let Some(dir) = candidate {
        if dir.is_dir() {
            dialog = dialog.set_directory(&dir);
        } else if let Some(parent) = dir.parent().filter(|p| p.is_dir()) {
            dialog = dialog.set_directory(parent);
        }
    }

    dialog
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn list_discovered_backups(custom_dir: Option<String>) -> Vec<BackupDescriptor> {
    let dir = custom_dir
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let cfg = load_app_settings_from(&settings_file_path());
            if !cfg.backup_root.is_empty() && Path::new(&cfg.backup_root).is_dir() {
                PathBuf::from(cfg.backup_root)
            } else {
                default_history_dir()
            }
        });
    discover_backups(&dir)
}

#[tauri::command]
fn load_backup_command(
    json_path: String,
    sort_chronological: Option<bool>,
) -> Result<ServerBackup, String> {
    load_backup(Path::new(&json_path), sort_chronological.unwrap_or(true))
}

#[tauri::command]
fn inspect_attachment(path: String) -> Result<AttachmentInspection, String> {
    inspect_attachment_file(Path::new(&path))
}

#[tauri::command]
fn set_local_author_profile(author_name: String, author_id: Option<String>) -> Result<AppSettings, String> {
    let s_path = settings_file_path();
    let mut cfg = load_app_settings_from(&s_path);
    let trimmed_name = author_name.trim();
    if !trimmed_name.is_empty() {
        cfg.local_author_name = trimmed_name.to_string();
    }
    if let Some(id_val) = author_id {
        let trimmed_id = id_val.trim();
        if !trimmed_id.is_empty() {
            cfg.local_author_id = trimmed_id.to_string();
        }
    }
    save_app_settings_to(&cfg, &s_path)?;
    Ok(cfg)
}

#[tauri::command]
fn create_local_message(
    json_path: String,
    channel_id: String,
    post_id: String,
    content: String,
    attachment_paths: Vec<String>,
    reply_to_id: Option<String>,
    new_revision: bool,
) -> Result<BackupMutationResult, String> {
    let mut backup = load_backup(Path::new(&json_path), true)?;
    let author = current_local_author();
    let att_files: Vec<PathBuf> = attachment_paths
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .collect();

    let created = add_message(
        &mut backup,
        &channel_id,
        &post_id,
        author,
        &content,
        &att_files,
        reply_to_id,
    )
    .map_err(|e| e.to_string())?;

    let saved = save_edited_backup(&mut backup, None, new_revision, None)
        .map_err(|e| e.to_string())?;
    let reloaded = load_backup(&saved, true)?;
    Ok(BackupMutationResult {
        backup: reloaded,
        saved_path: saved.to_string_lossy().to_string(),
        active_post_id: Some(post_id),
        active_message_id: Some(created.id),
    })
}

#[tauri::command]
fn edit_local_message(
    json_path: String,
    channel_id: String,
    post_id: String,
    message_id: String,
    new_content: String,
    new_attachment_paths: Vec<String>,
    new_revision: bool,
) -> Result<BackupMutationResult, String> {
    let mut backup = load_backup(Path::new(&json_path), true)?;
    let att_files: Vec<PathBuf> = new_attachment_paths
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .collect();

    let updated = edit_message(
        &mut backup,
        &channel_id,
        &post_id,
        &message_id,
        &new_content,
        &att_files,
    )
    .map_err(|e| e.to_string())?;

    let saved = save_edited_backup(&mut backup, None, new_revision, None)
        .map_err(|e| e.to_string())?;
    let reloaded = load_backup(&saved, true)?;
    Ok(BackupMutationResult {
        backup: reloaded,
        saved_path: saved.to_string_lossy().to_string(),
        active_post_id: Some(post_id),
        active_message_id: Some(updated.id),
    })
}

#[tauri::command]
fn delete_local_message(
    json_path: String,
    channel_id: String,
    post_id: String,
    message_id: String,
    new_revision: bool,
) -> Result<BackupMutationResult, String> {
    let mut backup = load_backup(Path::new(&json_path), true)?;
    delete_message(&mut backup, &channel_id, &post_id, &message_id)
        .map_err(|e| e.to_string())?;

    let saved = save_edited_backup(&mut backup, None, new_revision, None)
        .map_err(|e| e.to_string())?;
    let reloaded = load_backup(&saved, true)?;
    Ok(BackupMutationResult {
        backup: reloaded,
        saved_path: saved.to_string_lossy().to_string(),
        active_post_id: Some(post_id),
        active_message_id: None,
    })
}

#[tauri::command]
fn create_local_post(
    json_path: String,
    channel_id: String,
    title: String,
    initial_content: String,
    tag_ids: Vec<String>,
    attachment_paths: Vec<String>,
    new_revision: bool,
) -> Result<BackupMutationResult, String> {
    let mut backup = load_backup(Path::new(&json_path), true)?;
    let author = current_local_author();
    let att_files: Vec<PathBuf> = attachment_paths
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .collect();

    let created = create_post(
        &mut backup,
        &channel_id,
        &title,
        author,
        &initial_content,
        &tag_ids,
        &att_files,
    )
    .map_err(|e| e.to_string())?;

    let saved = save_edited_backup(&mut backup, None, new_revision, None)
        .map_err(|e| e.to_string())?;
    let reloaded = load_backup(&saved, true)?;
    let first_msg_id = created.messages.first().map(|m| m.id.clone());
    Ok(BackupMutationResult {
        backup: reloaded,
        saved_path: saved.to_string_lossy().to_string(),
        active_post_id: Some(created.id),
        active_message_id: first_msg_id,
    })
}

#[tauri::command]
fn save_backup_revision(json_path: String) -> Result<BackupMutationResult, String> {
    let mut backup = load_backup(Path::new(&json_path), true)?;
    let saved = save_edited_backup(&mut backup, None, true, None)
        .map_err(|e| e.to_string())?;
    let reloaded = load_backup(&saved, true)?;
    Ok(BackupMutationResult {
        backup: reloaded,
        saved_path: saved.to_string_lossy().to_string(),
        active_post_id: None,
        active_message_id: None,
    })
}

#[tauri::command]
fn save_backup_changes(backup: ServerBackup) -> Result<BackupMutationResult, String> {
    let saved = save_session_backup(backup).map_err(|e| e.to_string())?;
    let reloaded = load_backup(&saved, true)?;
    Ok(BackupMutationResult {
        backup: reloaded,
        saved_path: saved.to_string_lossy().to_string(),
        active_post_id: None,
        active_message_id: None,
    })
}

#[tauri::command]
fn delete_edited_backup_command(json_path: String) -> Result<BackupMutationResult, String> {
    let orig_path = delete_edited_backup(Path::new(&json_path)).map_err(|e| e.to_string())?;
    let reloaded = load_backup(&orig_path, true)?;
    Ok(BackupMutationResult {
        backup: reloaded,
        saved_path: orig_path.to_string_lossy().to_string(),
        active_post_id: None,
        active_message_id: None,
    })
}

#[tauri::command]
fn open_path_in_os(path: String, reveal_in_folder: bool) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if reveal_in_folder {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", target.to_string_lossy()))
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        Command::new("cmd")
            .args(["/C", "start", "", &target.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Only http:// and https:// URLs are allowed.".to_string());
    }
    Command::new("cmd")
        .args(["/C", "start", "", trimmed])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_app_settings,
            set_backup_root,
            remove_recent_backup_root,
            pick_backup_folder,
            set_local_author_profile,
            list_discovered_backups,
            load_backup_command,
            inspect_attachment,
            create_local_message,
            edit_local_message,
            delete_local_message,
            create_local_post,
            save_backup_revision,
            save_backup_changes,
            delete_edited_backup_command,
            open_path_in_os,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running ChatServerBackup application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::loader::{parse_embed, resolve_attachment};
    use crate::model::Author;
    use crate::storage::{
        add_message, create_post, delete_message, edit_message, save_edited_backup, StorageError,
    };
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use std::collections::BTreeMap;
    use std::fs;
    use tempfile::TempDir;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repo root")
            .to_path_buf()
    }

    fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if !matches!(
                        name,
                        "target"
                            | "node_modules"
                            | ".git"
                            | ".git-docs"
                            | "reference"
                            | "history"
                            | "dist"
                            | "build-frontend"
                    ) {
                        collect_files(&p, out);
                    }
                } else if p.is_file() {
                    out.push(p);
                }
            }
        }
    }

    #[test]
    fn test_no_forbidden_term_in_codebase() {
        let forbidden = ["dis", "cord"].concat();
        let root = repo_root();
        let mut files = Vec::new();
        collect_files(&root.join("src"), &mut files);
        collect_files(&root.join("src-tauri").join("src"), &mut files);
        collect_files(&root.join("tests"), &mut files);
        files.push(root.join("package.json"));
        files.push(root.join("src-tauri").join("Cargo.toml"));
        files.push(root.join("src-tauri").join("tauri.conf.json"));

        let mut violations = Vec::new();
        for file in files {
            if let Ok(text) = fs::read_to_string(&file) {
                if text.to_lowercase().contains(&forbidden) {
                    violations.push(file.to_string_lossy().to_string());
                }
            }
        }
        assert!(
            violations.is_empty(),
            "Forbidden term found in files: {:?}",
            violations
        );
    }

    #[test]
    fn test_version_alignment() {
        let root = repo_root();
        let cargo_version = env!("CARGO_PKG_VERSION");

        let pkg_json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join("package.json")).unwrap()).unwrap();
        let tauri_conf: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(root.join("src-tauri").join("tauri.conf.json")).unwrap(),
        )
        .unwrap();

        assert_eq!(pkg_json["version"].as_str().unwrap(), cargo_version);
        assert_eq!(tauri_conf["version"].as_str().unwrap(), cargo_version);
    }

    fn create_sample_history(tmp: &Path) -> PathBuf {
        let history_dir = tmp.join("history");
        let date_dir = history_dir.join("2026-10-20");
        let assets_dir = date_dir.join("assets_2026-10-20");
        fs::create_dir_all(&assets_dir).unwrap();

        fs::write(assets_dir.join("1001_diagram.png"), b"\x89PNG\r\n\x1a\nsample").unwrap();
        fs::write(assets_dir.join("1002_notes.txt"), "Line 1\nLine 2\n").unwrap();

        let legacy_embed = "{'title': 'Reference Document', 'description': 'Summary of the architecture', 'url': 'https://example.org/spec', 'color': 5793266, 'author': {'name': 'Spec Author'}, 'footer': {'text': 'Footer note'}, 'fields': [{'name': 'Section', 'value': 'Storage', 'inline': True}]}";

        let payload = json!({
            "id": "999000111",
            "name": "Engineering Archive",
            "channels": [
                {
                    "id": "ch_forum_1",
                    "name": "knowledge-base",
                    "type": "forum",
                    "available_tags": [
                        {"id": "tag_docs", "name": "docs", "moderated": false, "emoji": "📄"},
                        {"id": "tag_audio", "name": "audio", "moderated": false, "emoji": null}
                    ],
                    "posts": [
                        {
                            "id": "post_100",
                            "parent_id": "ch_forum_1",
                            "name": "System notes",
                            "type": "thread",
                            "applied_tags": [{"id": "tag_docs", "name": "docs", "emoji": "📄"}],
                            "messages": [
                                {
                                    "id": "2002",
                                    "type": "message",
                                    "author": {"id": "u1", "name": "alice", "bot": false},
                                    "content": "Second message chronologically",
                                    "timestamp": "2026-10-20T12:05:00+00:00",
                                    "attachments": ["assets_2026-10-20/1002_notes.txt"],
                                    "embeds": [legacy_embed]
                                },
                                {
                                    "id": "2001",
                                    "type": "message",
                                    "author": {"id": "u1", "name": "alice", "bot": false},
                                    "content": "First message chronologically",
                                    "timestamp": "2026-10-20T12:00:00+00:00",
                                    "attachments": ["assets_2026-10-20/1001_diagram.png"],
                                    "embeds": []
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "ch_text_1",
                    "name": "general-chat",
                    "type": "text",
                    "posts": [
                        {
                            "id": "3002",
                            "type": "message",
                            "author": {"id": "u2", "name": "bob", "bot": false},
                            "content": "Later message in general",
                            "timestamp": "2026-10-20T13:10:00+00:00",
                            "attachments": [],
                            "embeds": []
                        },
                        {
                            "id": "3001",
                            "type": "message",
                            "author": {"id": "u1", "name": "alice", "bot": false},
                            "content": "Earlier message in general",
                            "timestamp": "2026-10-20T13:00:00+00:00",
                            "attachments": [],
                            "embeds": []
                        },
                        {
                            "id": "thread_400",
                            "parent_id": "ch_text_1",
                            "name": "Side discussion",
                            "type": "thread",
                            "applied_tags": [],
                            "messages": [
                                {
                                    "id": "4001",
                                    "type": "message",
                                    "author": {"id": "u2", "name": "bob", "bot": false},
                                    "content": "Inside child thread",
                                    "timestamp": "2026-10-20T13:15:00+00:00",
                                    "attachments": [],
                                    "embeds": []
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        let export_file = date_dir.join("server_export_2026-10-20.json");
        fs::write(&export_file, serde_json::to_string_pretty(&payload).unwrap()).unwrap();
        history_dir
    }

    #[test]
    fn test_discover_and_load_v1_backup() {
        let tmp = TempDir::new().unwrap();
        let history_dir = create_sample_history(tmp.path());

        let descriptors = discover_backups(&history_dir);
        assert_eq!(descriptors.len(), 1);
        assert_eq!(descriptors[0].display_label, "2026-10-20 (Original)");
        assert!(!descriptors[0].is_edited);

        let backup = load_backup(Path::new(&descriptors[0].json_path), true).unwrap();
        assert_eq!(backup.name, "Engineering Archive");
        assert_eq!(backup.channels.len(), 2);

        let forum = &backup.channels[0];
        let post = &forum.posts[0];
        assert_eq!(post.messages[0].id, "2001");
        assert_eq!(post.messages[1].id, "2002");
        assert!(post.messages[0].attachments[0].exists);
        assert_eq!(post.messages[0].attachments[0].extension, "png");

        let embed = &post.messages[1].embeds[0];
        assert_eq!(embed.title, "Reference Document");
        assert_eq!(embed.author_name, "Spec Author");
        assert_eq!(embed.footer_text, "Footer note");
        assert_eq!(embed.fields.len(), 1);
        assert!(embed.fields[0].inline);

        let text_ch = &backup.channels[1];
        assert_eq!(text_ch.posts.len(), 2);
        assert_eq!(text_ch.posts[0].r#type, "channel_stream");
        assert_eq!(text_ch.posts[0].messages[0].id, "3001");
        assert_eq!(text_ch.posts[0].messages[1].id, "3002");
        assert_eq!(text_ch.posts[1].id, "thread_400");
    }

    #[test]
    fn test_path_traversal_blocked_and_embed_fallbacks() {
        let tmp = TempDir::new().unwrap();
        let history_dir = create_sample_history(tmp.path());
        let backup_dir = history_dir.join("2026-10-20");

        let bad_rel = resolve_attachment(&json!("../../secret.txt"), &backup_dir, "2026-10-20");
        assert!(bad_rel.resolved_path.is_none());
        assert!(!bad_rel.exists);

        let bad_abs = resolve_attachment(
            &json!("C:/Windows/System32/cmd.exe"),
            &backup_dir,
            "2026-10-20",
        );
        assert!(bad_abs.resolved_path.is_none());

        let fallback = parse_embed(&json!("plain string note"));
        assert_eq!(fallback.description, "plain string note");
    }

    #[test]
    fn test_reference_backup_loads_if_present() {
        let ref_json = repo_root()
            .join("reference")
            .join("history")
            .join("2026-10-20")
            .join("server_export_2026-10-20.json");
        if !ref_json.is_file() {
            return;
        }

        let backup = load_backup(&ref_json, true).unwrap();
        assert_eq!(backup.id, "1175623460161065030");
        assert!(!backup.channels.is_empty());
        let forum = &backup.channels[0];
        assert_eq!(forum.available_tags.len(), 8);
        let all_atts: Vec<_> = forum
            .posts
            .iter()
            .flat_map(|p| p.messages.iter())
            .flat_map(|m| m.attachments.iter())
            .collect();
        assert!(all_atts.len() >= 38);
        assert!(all_atts.iter().all(|a| a.exists));
    }

    fn sha256_bytes(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

    fn snapshot_dir_hashes(dir: &Path) -> BTreeMap<String, String> {
        let mut map = BTreeMap::new();
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let name = p.file_name().unwrap().to_string_lossy().to_string();
                    let digest = sha256_bytes(&fs::read(&p).unwrap());
                    map.insert(name, digest);
                }
            }
        }
        map
    }

    #[test]
    fn test_copy_on_write_editing_preserves_original_backup() {
        let tmp = TempDir::new().unwrap();
        let history_dir = create_sample_history(tmp.path());
        let date_dir = history_dir.join("2026-10-20");
        let orig_json = date_dir.join("server_export_2026-10-20.json");
        let orig_assets = date_dir.join("assets_2026-10-20");

        let orig_json_sha_before = sha256_bytes(&fs::read(&orig_json).unwrap());
        let orig_assets_sha_before = snapshot_dir_hashes(&orig_assets);

        let mut backup = load_backup(&orig_json, true).unwrap();
        let author = Author {
            id: "u_local".to_string(),
            name: "local_editor".to_string(),
            bot: false,
        };

        let new_att = tmp.path().join("snippet.py");
        fs::write(&new_att, "print('local attachment')\n").unwrap();

        let added = add_message(
            &mut backup,
            "ch_forum_1",
            "post_100",
            author.clone(),
            "New local message",
            &[new_att],
            None,
        )
        .unwrap();
        assert_eq!(added.local_edit_state, "added");
        assert!(added.attachments[0].exists);
        assert!(added.attachments[0]
            .relative_path
            .contains("assets_2026-10-20_edited"));

        let edited = edit_message(
            &mut backup,
            "ch_forum_1",
            "post_100",
            "2001",
            "First message chronologically (edited locally)",
            &[],
        )
        .unwrap();
        assert_eq!(edited.local_edit_state, "edited");
        assert!(edited.edited_timestamp.is_some());

        let deleted = delete_message(&mut backup, "ch_forum_1", "post_100", "2002").unwrap();
        assert!(deleted);

        let created_post = create_post(
            &mut backup,
            "ch_forum_1",
            "New Local Topic",
            author,
            "Starter body",
            &["tag_docs".to_string()],
            &[],
        )
        .unwrap();
        assert_eq!(created_post.messages.len(), 1);
        assert_eq!(created_post.applied_tags[0].id, "tag_docs");

        let err = save_edited_backup(&mut backup, Some(&orig_json), false, None).unwrap_err();
        assert!(matches!(err, StorageError::ImmutableBackup(_)));

        let rolling_path = save_edited_backup(&mut backup, None, false, None).unwrap();
        assert_eq!(
            rolling_path.file_name().unwrap().to_str().unwrap(),
            "server_export_2026-10-20_edited.json"
        );
        assert!(rolling_path.is_file());

        let rev_path =
            save_edited_backup(&mut backup, None, true, Some("2026-10-24_151000")).unwrap();
        assert_eq!(
            rev_path.file_name().unwrap().to_str().unwrap(),
            "server_export_2026-10-20_edited_2026-10-24_151000.json"
        );
        assert!(rev_path.is_file());

        assert_eq!(
            sha256_bytes(&fs::read(&orig_json).unwrap()),
            orig_json_sha_before
        );
        assert_eq!(snapshot_dir_hashes(&orig_assets), orig_assets_sha_before);

        let reloaded = load_backup(&rolling_path, true).unwrap();
        assert!(reloaded.is_edited);
        assert_eq!(reloaded.based_on_export, "server_export_2026-10-20.json");
        assert_eq!(reloaded.channels[0].posts.len(), 2);
        let p100 = &reloaded.channels[0].posts[0];
        assert_eq!(p100.messages.len(), 2);
        assert_eq!(
            p100.messages[0].content,
            "First message chronologically (edited locally)"
        );
        assert_eq!(p100.messages[0].local_edit_state, "edited");
        assert_eq!(p100.messages[1].local_edit_state, "added");
        assert!(p100.messages[1].attachments[0].exists);

        let discovered = discover_backups(&history_dir);
        let labels: Vec<_> = discovered.iter().map(|d| d.display_label.as_str()).collect();
        assert_eq!(
            labels,
            vec![
                "2026-10-20 (Original)",
                "2026-10-20 (Edited)",
            ]
        );
    }

    #[test]
    fn test_explicit_save_merge_from_original_and_delete_edited() {
        let tmp = TempDir::new().unwrap();
        let history_dir = create_sample_history(tmp.path());
        let orig_json = history_dir
            .join("2026-10-20")
            .join("server_export_2026-10-20.json");
        let orig_sha_before = sha256_bytes(&fs::read(&orig_json).unwrap());

        let author = Author {
            id: "u_local".to_string(),
            name: "local_editor".to_string(),
            bot: false,
        };

        // Session 1: Load Original, create Post 1 ("test") in memory, then explicitly Save
        let mut session1 = load_backup(&orig_json, true).unwrap();
        let post1 = create_post(
            &mut session1,
            "ch_forum_1",
            "test",
            author.clone(),
            "First test post body",
            &["tag_docs".to_string()],
            &[],
        )
        .unwrap();

        let saved1 = save_backup_changes(session1).unwrap();
        assert!(saved1.backup.is_edited);
        assert!(saved1.saved_path.ends_with("server_export_2026-10-20_edited.json"));
        assert!(saved1.backup.channels[0]
            .posts
            .iter()
            .any(|p| p.id == post1.id && p.name == "test"));

        // Session 2: Switch back to Original, create Post 2 ("test 2") in memory, then explicitly Save
        let mut session2_from_orig = load_backup(&orig_json, true).unwrap();
        assert!(!session2_from_orig.is_edited);
        let post2 = create_post(
            &mut session2_from_orig,
            "ch_forum_1",
            "test 2",
            author,
            "Second test post body",
            &[],
            &[],
        )
        .unwrap();

        let saved2 = save_backup_changes(session2_from_orig).unwrap();
        assert!(saved2.backup.is_edited);
        // Both "test" and "test 2" must exist in Edited (Post 1 is NOT overwritten!)
        let edited_posts = &saved2.backup.channels[0].posts;
        assert!(edited_posts.iter().any(|p| p.id == post1.id && p.name == "test"));
        assert!(edited_posts.iter().any(|p| p.id == post2.id && p.name == "test 2"));

        // Delete Edited Backup: removes *_edited.json and returns Original
        let del_res = delete_edited_backup_command(saved2.saved_path.clone()).unwrap();
        assert!(!del_res.backup.is_edited);
        assert!(!Path::new(&saved2.saved_path).exists());
        let discovered_after = discover_backups(&history_dir);
        assert_eq!(discovered_after.len(), 1);
        assert_eq!(discovered_after[0].display_label, "2026-10-20 (Original)");

        assert_eq!(
            sha256_bytes(&fs::read(&orig_json).unwrap()),
            orig_sha_before
        );
    }

    #[test]
    fn test_settings_persistence() {
        let tmp = TempDir::new().unwrap();
        let s_file = tmp.path().join("settings.json");
        let cfg = AppSettings {
            backup_root: "custom/history".to_string(),
            recent_backup_roots: vec!["custom/history".to_string()],
            local_author_name: "Hugo".to_string(),
            local_author_id: "u1".to_string(),
        };
        save_app_settings_to(&cfg, &s_file).unwrap();
        let loaded = load_app_settings_from(&s_file);
        assert_eq!(loaded.backup_root, "custom/history");
        assert_eq!(loaded.local_author_name, "Hugo");
    }

    #[test]
    fn test_inspect_attachments_and_reference_assets() {
        let tmp = TempDir::new().unwrap();
        let py_file = tmp.path().join("example.py");
        fs::write(&py_file, "def add(a, b):\n    return a + b\n").unwrap();
        let py_info = inspect_attachment_file(&py_file).unwrap();
        assert_eq!(py_info.kind, "text");
        let tp = py_info.text_preview.unwrap();
        assert_eq!(tp.language, "python");
        assert_eq!(tp.total_lines, 2);

        let assets_dir = repo_root()
            .join("reference")
            .join("history")
            .join("2026-10-20")
            .join("assets_2026-10-20");
        if !assets_dir.is_dir() {
            return;
        }

        // Verify .docx extraction on real backup file
        let docx_file =
            assets_dir.join("1544167728271593492_1541951031477538958_LettreRecommandation1.docx");
        if docx_file.is_file() {
            let docx_info = inspect_attachment_file(&docx_file).unwrap();
            assert_eq!(docx_info.kind, "docx");
            let dp = docx_info.docx_preview.unwrap();
            assert!(!dp.paragraphs.is_empty());
        }

        // Verify .7z archive listing on real backup file
        let sevenz_file = assets_dir.join("1544167740594462770_1541951357186215988_docs1.7z");
        if sevenz_file.is_file() {
            let sz_info = inspect_attachment_file(&sevenz_file).unwrap();
            assert_eq!(sz_info.kind, "archive");
            let entries = sz_info.archive_entries.unwrap();
            assert!(!entries.is_empty());
        }
    }

    #[test]
    fn test_local_editing_commands_workflow() {
        let tmp = TempDir::new().unwrap();
        let history_dir = create_sample_history(tmp.path());
        let orig_json = history_dir
            .join("2026-10-20")
            .join("server_export_2026-10-20.json");
        let orig_sha_before = sha256_bytes(&fs::read(&orig_json).unwrap());

        let msg_res = create_local_message(
            orig_json.to_string_lossy().to_string(),
            "ch_forum_1".to_string(),
            "post_100".to_string(),
            "Command-created message".to_string(),
            vec![],
            Some("2001".to_string()),
            false,
        )
        .unwrap();
        assert!(msg_res.backup.is_edited);
        let new_msg_id = msg_res.active_message_id.unwrap();

        let edit_res = edit_local_message(
            msg_res.saved_path.clone(),
            "ch_forum_1".to_string(),
            "post_100".to_string(),
            new_msg_id.clone(),
            "Command-created message (updated)".to_string(),
            vec![],
            false,
        )
        .unwrap();
        let edited_post = &edit_res.backup.channels[0].posts[0];
        assert!(edited_post
            .messages
            .iter()
            .any(|m| m.id == new_msg_id && m.content == "Command-created message (updated)"));

        let del_res = delete_local_message(
            edit_res.saved_path.clone(),
            "ch_forum_1".to_string(),
            "post_100".to_string(),
            new_msg_id.clone(),
            false,
        )
        .unwrap();
        assert!(!del_res.backup.channels[0].posts[0]
            .messages
            .iter()
            .any(|m| m.id == new_msg_id));

        let post_res = create_local_post(
            del_res.saved_path.clone(),
            "ch_forum_1".to_string(),
            "Command Forum Topic".to_string(),
            "Starter post content".to_string(),
            vec!["tag_docs".to_string()],
            vec![],
            false,
        )
        .unwrap();
        assert_eq!(post_res.backup.channels[0].posts.len(), 2);

        let rev_res = save_backup_revision(post_res.saved_path).unwrap();
        assert!(rev_res.saved_path.contains("_edited_"));

        assert_eq!(
            sha256_bytes(&fs::read(&orig_json).unwrap()),
            orig_sha_before
        );
    }

    #[test]
    fn test_export_bot_security_and_upgraded_features() {
        let bot_path = repo_root().join("bot").join("export_bot.py");
        assert!(bot_path.is_file(), "bot/export_bot.py must exist");
        let code = fs::read_to_string(&bot_path).unwrap();

        // Must read token from CHAT_BACKUP_BOT_TOKEN and never hardcode the prototype token
        assert!(code.contains("CHAT_BACKUP_BOT_TOKEN"));
        assert!(!code.contains("MTU0NDEwODY2Njk0MzE3NjcxNQ"));

        // Must support archived threads, chronological history, and native JSON embed dicts
        assert!(code.contains("archived_threads"));
        assert!(code.contains("oldest_first=True"));
        assert!(code.contains("[e.to_dict() for e in message.embeds]"));
        assert!(!code.contains("str(e.to_dict())"));
    }

    #[test]
    fn test_recent_backup_roots_persistence_and_deduplication() {
        let tmp = TempDir::new().unwrap();
        let s_file = tmp.path().join("settings.json");

        let mut cfg = load_app_settings_from(&s_file);
        assert!(cfg.recent_backup_roots.is_empty());

        push_recent_backup_root(&mut cfg, r"C:\Backups\ServerA\history");
        push_recent_backup_root(&mut cfg, r"F:\Archive\ServerB\history");
        // Re-adding ServerA (case-insensitive) should move it to index 0 without duplicating
        push_recent_backup_root(&mut cfg, r"c:\backups\servera\history");

        assert_eq!(cfg.recent_backup_roots.len(), 2);
        assert_eq!(cfg.recent_backup_roots[0], r"c:\backups\servera\history");
        assert_eq!(cfg.recent_backup_roots[1], r"F:\Archive\ServerB\history");

        save_app_settings_to(&cfg, &s_file).unwrap();
        let reloaded = load_app_settings_from(&s_file);
        assert_eq!(reloaded.recent_backup_roots, cfg.recent_backup_roots);
    }
}
