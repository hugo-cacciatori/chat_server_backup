use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};

use chrono::DateTime;
use serde_json::{Map, Value};

use crate::model::{
    AttachmentRef, Author, BackupDescriptor, Channel, EmbedData, EmbedField, ForumTag, Message,
    PostOrThread, ServerBackup,
};

const EXPORT_PREFIX: &str = "server_export_";
const EDITED_MARKER: &str = "_edited";

pub fn extract_date_label(json_path: &Path) -> String {
    if let Some(stem) = json_path.file_stem().and_then(|s| s.to_str()) {
        if let Some(rest) = stem.strip_prefix(EXPORT_PREFIX) {
            if let Some(idx) = rest.find(EDITED_MARKER) {
                return rest[..idx].to_string();
            }
            return rest.to_string();
        }
    }
    json_path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string()
}

pub fn base_export_stem(json_path: &Path) -> String {
    let stem = json_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("server_export");
    if let Some(idx) = stem.find(EDITED_MARKER) {
        stem[..idx].to_string()
    } else {
        stem.to_string()
    }
}

pub fn discover_backups(history_dir: &Path) -> Vec<BackupDescriptor> {
    if !history_dir.is_dir() {
        return Vec::new();
    }

    let mut date_dirs: Vec<PathBuf> = fs::read_dir(history_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok().map(|entry| entry.path()))
        .filter(|p| p.is_dir())
        .collect();

    date_dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    let mut descriptors = Vec::new();
    for date_dir in date_dirs {
        let date_label = date_dir
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let mut json_files: Vec<PathBuf> = fs::read_dir(&date_dir)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok().map(|entry| entry.path()))
            .filter(|p| {
                p.is_file()
                    && p.extension().and_then(|e| e.to_str()) == Some("json")
                    && p.file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.starts_with(EXPORT_PREFIX))
                        .unwrap_or(false)
            })
            .collect();

        json_files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

        let (editeds, originals): (Vec<PathBuf>, Vec<PathBuf>) = json_files
            .into_iter()
            .partition(|p| {
                p.file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.contains(EDITED_MARKER))
                    .unwrap_or(false)
            });

        for orig in originals {
            let file_name = orig
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            descriptors.append(&mut vec![BackupDescriptor {
                date_label: date_label.clone(),
                json_path: orig.to_string_lossy().to_string(),
                is_edited: false,
                display_label: format!("{date_label} (Original)"),
                based_on_filename: file_name,
            }]);
        }

        for ed in editeds {
            let base = base_export_stem(&ed);
            let stem = ed.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let suffix = &stem[base.len()..];
            let label = if suffix == EDITED_MARKER {
                format!("{date_label} (Edited)")
            } else {
                let rev = suffix.strip_prefix(&format!("{EDITED_MARKER}_")).unwrap_or(suffix);
                format!("{date_label} (Edited {rev})")
            };
            descriptors.push(BackupDescriptor {
                date_label: date_label.clone(),
                json_path: ed.to_string_lossy().to_string(),
                is_edited: true,
                display_label: label,
                based_on_filename: format!("{base}.json"),
            });
        }
    }

    descriptors
}

/// Convert a Python `repr()` dictionary string into valid JSON so `serde_json` can parse legacy embeds.
fn python_dict_repr_to_json(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 16);
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c == '\'' {
            out.push('"');
            i += 1;
            while i < chars.len() {
                let sc = chars[i];
                if sc == '\\' && i + 1 < chars.len() {
                    let next = chars[i + 1];
                    if next == '\'' {
                        out.push('\'');
                    } else {
                        out.push('\\');
                        out.push(next);
                    }
                    i += 2;
                } else if sc == '"' {
                    out.push('\\');
                    out.push('"');
                    i += 1;
                } else if sc == '\'' {
                    out.push('"');
                    i += 1;
                    break;
                } else {
                    out.push(sc);
                    i += 1;
                }
            }
        } else if c == '"' {
            out.push('"');
            i += 1;
            while i < chars.len() {
                let sc = chars[i];
                if sc == '\\' && i + 1 < chars.len() {
                    out.push('\\');
                    out.push(chars[i + 1]);
                    i += 2;
                } else if sc == '"' {
                    out.push('"');
                    i += 1;
                    break;
                } else {
                    out.push(sc);
                    i += 1;
                }
            }
        } else if c.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            match word.as_str() {
                "None" => out.push_str("null"),
                "True" => out.push_str("true"),
                "False" => out.push_str("false"),
                _ => out.push_str(&word),
            }
        } else {
            out.push(c);
            i += 1;
        }
    }

    out
}

pub fn parse_embed(raw_embed: &Value) -> EmbedData {
    let parsed_map: Option<Map<String, Value>> = match raw_embed {
        Value::Object(map) => Some(map.clone()),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.starts_with('{') && trimmed.ends_with('}') {
                if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(trimmed) {
                    Some(map)
                } else {
                    let converted = python_dict_repr_to_json(trimmed);
                    if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&converted) {
                        Some(map)
                    } else {
                        None
                    }
                }
            } else {
                None
            }
        }
        _ => None,
    };

    let Some(map) = parsed_map else {
        let text = match raw_embed {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        let mut raw = Map::new();
        raw.insert("_raw_text".to_string(), Value::String(text.clone()));
        return EmbedData {
            title: String::new(),
            description: text,
            url: String::new(),
            color: None,
            author_name: String::new(),
            footer_text: String::new(),
            image_url: String::new(),
            thumbnail_url: String::new(),
            fields: Vec::new(),
            raw,
        };
    };

    let get_str = |key: &str| -> String {
        map.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let color = map.get("color").and_then(|v| v.as_i64());

    let author_name = map
        .get("author")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let footer_text = map
        .get("footer")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("text"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let image_url = map
        .get("image")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let thumbnail_url = map
        .get("thumbnail")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let fields = map
        .get("fields")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_object())
                .map(|obj| EmbedField {
                    name: obj
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    value: obj
                        .get("value")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    inline: obj.get("inline").and_then(|v| v.as_bool()).unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();

    EmbedData {
        title: get_str("title"),
        description: get_str("description"),
        url: get_str("url"),
        color,
        author_name,
        footer_text,
        image_url,
        thumbnail_url,
        fields,
        raw: map,
    }
}

pub fn extract_extension(filename: &str) -> String {
    Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

pub fn resolve_attachment(raw_entry: &Value, backup_dir: &Path, date_label: &str) -> AttachmentRef {
    let raw_str = match raw_entry {
        Value::String(s) => s.clone(),
        Value::Object(map) => map
            .get("relative_path")
            .or_else(|| map.get("path"))
            .or_else(|| map.get("filename"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        other => other.to_string(),
    };

    let normalized = raw_str.replace('\\', "/");
    let trimmed = normalized.trim_matches('/');

    let has_unsafe_component = trimmed.is_empty()
        || trimmed.contains(':')
        || Path::new(trimmed).components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        });

    if has_unsafe_component {
        let safe_name = Path::new(trimmed)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("attachment")
            .replace("..", "");
        let ext = extract_extension(&safe_name);
        return AttachmentRef {
            relative_path: safe_name.clone(),
            filename: safe_name,
            resolved_path: None,
            extension: ext,
            exists: false,
        };
    }

    let parts: Vec<&str> = trimmed
        .split('/')
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    let filename = parts.last().copied().unwrap_or("attachment").to_string();
    let rel_path = parts.join("/");
    let ext = extract_extension(&filename);

    let mut direct_candidate = backup_dir.to_path_buf();
    for p in &parts {
        direct_candidate.push(p);
    }

    let candidates = [
        direct_candidate.clone(),
        backup_dir
            .join(format!("assets_{date_label}_edited"))
            .join(&filename),
        backup_dir
            .join(format!("assets_{date_label}"))
            .join(&filename),
    ];

    for cand in &candidates {
        if cand.is_file() {
            return AttachmentRef {
                relative_path: rel_path,
                filename,
                resolved_path: Some(cand.to_string_lossy().to_string()),
                extension: ext,
                exists: true,
            };
        }
    }

    AttachmentRef {
        relative_path: rel_path,
        filename,
        resolved_path: Some(direct_candidate.to_string_lossy().to_string()),
        extension: ext,
        exists: false,
    }
}

fn compare_messages_chronologically(a: &Message, b: &Message) -> Ordering {
    let ts_a = DateTime::parse_from_rfc3339(&a.timestamp)
        .map(|dt| dt.timestamp_micros())
        .unwrap_or(0);
    let ts_b = DateTime::parse_from_rfc3339(&b.timestamp)
        .map(|dt| dt.timestamp_micros())
        .unwrap_or(0);

    match ts_a.cmp(&ts_b) {
        Ordering::Equal => {
            let id_a = a.id.parse::<u128>().unwrap_or(0);
            let id_b = b.id.parse::<u128>().unwrap_or(0);
            id_a.cmp(&id_b).then_with(|| a.id.cmp(&b.id))
        }
        other => other,
    }
}

fn parse_tag(raw: &Value) -> Option<ForumTag> {
    let obj = raw.as_object()?;
    Some(ForumTag {
        id: obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        name: obj
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        moderated: obj
            .get("moderated")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        emoji: obj
            .get("emoji")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

fn parse_message(raw: &Value, backup_dir: &Path, date_label: &str) -> Option<Message> {
    let obj = raw.as_object()?;
    let author = if let Some(a_obj) = obj.get("author").and_then(|v| v.as_object()) {
        Author {
            id: a_obj
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            name: a_obj
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            bot: a_obj.get("bot").and_then(|v| v.as_bool()).unwrap_or(false),
        }
    } else {
        Author {
            id: String::new(),
            name: "Unknown".to_string(),
            bot: false,
        }
    };

    let attachments = obj
        .get("attachments")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| resolve_attachment(a, backup_dir, date_label))
                .collect()
        })
        .unwrap_or_default();

    let embeds = obj
        .get("embeds")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(parse_embed).collect())
        .unwrap_or_default();

    let state_raw = obj
        .get("local_edit_state")
        .and_then(|v| v.as_str())
        .unwrap_or("original");
    let local_edit_state = match state_raw {
        "added" | "edited" => state_raw.to_string(),
        _ => "original".to_string(),
    };

    Some(Message {
        id: obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        author,
        content: obj
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        timestamp: obj
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        attachments,
        embeds,
        edited_timestamp: obj
            .get("edited_timestamp")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        reply_to_id: obj
            .get("reply_to_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        local_edit_state,
    })
}

fn parse_post_or_thread(
    raw: &Value,
    backup_dir: &Path,
    date_label: &str,
    sort_chronological: bool,
) -> Option<PostOrThread> {
    let obj = raw.as_object()?;
    let applied_tags = obj
        .get("applied_tags")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(parse_tag).collect())
        .unwrap_or_default();

    let mut messages: Vec<Message> = obj
        .get("messages")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| parse_message(m, backup_dir, date_label))
                .collect()
        })
        .unwrap_or_default();

    if sort_chronological {
        messages.sort_by(compare_messages_chronologically);
    }

    let post_type = match obj.get("type").and_then(|v| v.as_str()) {
        Some("channel_stream") => "channel_stream".to_string(),
        _ => "thread".to_string(),
    };

    Some(PostOrThread {
        id: obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        parent_id: obj
            .get("parent_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        name: obj
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled")
            .to_string(),
        r#type: post_type,
        applied_tags,
        messages,
    })
}

pub fn load_backup(json_path: &Path, sort_chronological: bool) -> Result<ServerBackup, String> {
    let raw_bytes =
        fs::read_to_string(json_path).map_err(|e| format!("Failed to read {:?}: {e}", json_path))?;
    let root: Value = serde_json::from_str(&raw_bytes)
        .map_err(|e| format!("Invalid JSON in {:?}: {e}", json_path))?;
    let root_obj = root
        .as_object()
        .ok_or_else(|| "Expected JSON object at root".to_string())?;

    let backup_dir = json_path
        .parent()
        .ok_or_else(|| "Backup path has no parent directory".to_string())?;
    let date_label = extract_date_label(json_path);
    let orig_stem = base_export_stem(json_path);
    let original_source_path = backup_dir.join(format!("{orig_stem}.json"));

    let stem_has_edited = json_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.contains(EDITED_MARKER))
        .unwrap_or(false);
    let is_edited = stem_has_edited || root_obj.contains_key("based_on_export");

    let based_on_export = root_obj
        .get("based_on_export")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{orig_stem}.json"));

    let last_modified_at = root_obj
        .get("last_modified_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let schema_version = root_obj
        .get("schema_version")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;

    let mut channels = Vec::new();
    if let Some(raw_channels) = root_obj.get("channels").and_then(|v| v.as_array()) {
        for raw_ch in raw_channels {
            let Some(ch_obj) = raw_ch.as_object() else {
                continue;
            };
            let ch_id = ch_obj
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let ch_name = ch_obj
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unnamed")
                .to_string();
            let ch_type = match ch_obj.get("type").and_then(|v| v.as_str()) {
                Some("forum") => "forum".to_string(),
                _ => "text".to_string(),
            };

            let available_tags = ch_obj
                .get("available_tags")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(parse_tag).collect())
                .unwrap_or_default();

            let mut posts = Vec::new();
            let mut direct_messages = Vec::new();

            if let Some(raw_posts) = ch_obj.get("posts").and_then(|v| v.as_array()) {
                for item in raw_posts {
                    let Some(item_obj) = item.as_object() else {
                        continue;
                    };
                    if item_obj.get("type").and_then(|v| v.as_str()) == Some("message")
                        && !item_obj.contains_key("messages")
                    {
                        if let Some(msg) = parse_message(item, backup_dir, &date_label) {
                            direct_messages.push(msg);
                        }
                    } else if let Some(post) =
                        parse_post_or_thread(item, backup_dir, &date_label, sort_chronological)
                    {
                        posts.push(post);
                    }
                }
            }

            if !direct_messages.is_empty() {
                if sort_chronological {
                    direct_messages.sort_by(compare_messages_chronologically);
                }
                posts.insert(
                    0,
                    PostOrThread {
                        id: format!("{ch_id}_main"),
                        parent_id: Some(ch_id.clone()),
                        name: format!("# {ch_name} (Main)"),
                        r#type: "channel_stream".to_string(),
                        applied_tags: Vec::new(),
                        messages: direct_messages,
                    },
                );
            }

            channels.push(Channel {
                id: ch_id,
                name: ch_name,
                r#type: ch_type,
                available_tags,
                posts,
                category: ch_obj
                    .get("category")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                position: ch_obj
                    .get("position")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
            });
        }
    }

    Ok(ServerBackup {
        id: root_obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        name: root_obj
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Server Backup")
            .to_string(),
        date_label,
        source_path: json_path.to_string_lossy().to_string(),
        original_source_path: original_source_path.to_string_lossy().to_string(),
        is_edited,
        based_on_export,
        last_modified_at,
        schema_version,
        channels,
    })
}
