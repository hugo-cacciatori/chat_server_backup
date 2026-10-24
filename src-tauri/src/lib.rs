pub mod loader;
pub mod model;
pub mod storage;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use loader::{discover_backups, load_backup};
use model::{BackupDescriptor, ServerBackup};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub backup_root: String,
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
            local_author_name: default_author_name(),
            local_author_id: default_author_id(),
        }
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
        if let Some(dir) = exe.parent() {
            let direct = dir.join("history");
            if direct.is_dir() {
                return direct;
            }
        }
    }
    if let Ok(cwd) = env::current_dir() {
        let direct = cwd.join("history");
        if direct.is_dir() {
            return direct;
        }
        let dev_ref = cwd.join("reference").join("history");
        if dev_ref.is_dir() {
            return dev_ref;
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
    cfg
}

#[tauri::command]
fn set_backup_root(backup_root: String) -> Result<Vec<BackupDescriptor>, String> {
    let s_path = settings_file_path();
    let mut cfg = load_app_settings_from(&s_path);
    cfg.backup_root = backup_root.trim().to_string();
    save_app_settings_to(&cfg, &s_path)?;

    let dir = if cfg.backup_root.is_empty() {
        default_history_dir()
    } else {
        PathBuf::from(&cfg.backup_root)
    };
    Ok(discover_backups(&dir))
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
            list_discovered_backups,
            load_backup_command,
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
        files.push(root.join("README.md"));
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
                "2026-10-20 (Edited 2026-10-24_151000)"
            ]
        );
    }

    #[test]
    fn test_settings_persistence() {
        let tmp = TempDir::new().unwrap();
        let s_file = tmp.path().join("settings.json");
        let cfg = AppSettings {
            backup_root: "custom/history".to_string(),
            local_author_name: "Hugo".to_string(),
            local_author_id: "u1".to_string(),
        };
        save_app_settings_to(&cfg, &s_file).unwrap();
        let loaded = load_app_settings_from(&s_file);
        assert_eq!(loaded.backup_root, "custom/history");
        assert_eq!(loaded.local_author_name, "Hugo");
    }
}
