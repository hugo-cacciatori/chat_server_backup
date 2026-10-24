use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use serde_json::{json, Map, Value};
use thiserror::Error;

use crate::loader::{base_export_stem, extract_extension};
use crate::model::{AttachmentRef, Author, EmbedData, ForumTag, Message, PostOrThread, ServerBackup};

static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("ImmutableBackupError: refusing to overwrite original backup or asset path: {0}")]
    ImmutableBackup(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn is_original_backup_path(path: &Path) -> bool {
    !path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.contains("_edited"))
        .unwrap_or(false)
}

pub fn get_edited_backup_path(
    source_path: &Path,
    new_revision: bool,
    revision_suffix: Option<&str>,
) -> PathBuf {
    let parent = source_path.parent().unwrap_or_else(|| Path::new("."));
    let orig_stem = base_export_stem(source_path);
    if new_revision {
        let ts = revision_suffix
            .map(|s| s.to_string())
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d_%H%M%S").to_string());
        parent.join(format!("{orig_stem}_edited_{ts}.json"))
    } else {
        parent.join(format!("{orig_stem}_edited.json"))
    }
}

pub fn get_edited_assets_dir(backup: &ServerBackup) -> PathBuf {
    let backup_dir = Path::new(&backup.source_path)
        .parent()
        .unwrap_or_else(|| Path::new("."));
    backup_dir.join(format!("assets_{}_edited", backup.date_label))
}

fn generate_local_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed) as u128;
    (nanos + seq).to_string()
}

pub fn stage_local_attachment(
    backup: &ServerBackup,
    source_file: &Path,
) -> Result<AttachmentRef, StorageError> {
    if !source_file.is_file() {
        return Err(StorageError::NotFound(format!(
            "Attachment source file does not exist: {:?}",
            source_file
        )));
    }

    let backup_dir = Path::new(&backup.source_path)
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let edited_assets = get_edited_assets_dir(backup);
    let orig_assets = backup_dir.join(format!("assets_{}", backup.date_label));

    if edited_assets == orig_assets {
        return Err(StorageError::ImmutableBackup(
            edited_assets.to_string_lossy().to_string(),
        ));
    }

    fs::create_dir_all(&edited_assets)?;
    let orig_name = source_file
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("attachment");
    let safe_name = format!("{}_{}", generate_local_id(), orig_name);
    let dest = edited_assets.join(&safe_name);
    fs::copy(source_file, &dest)?;

    let folder_name = edited_assets
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("assets_edited");
    let rel_path = format!("{folder_name}/{safe_name}");
    let ext = extract_extension(&safe_name);

    Ok(AttachmentRef {
        relative_path: rel_path,
        filename: safe_name,
        resolved_path: Some(dest.to_string_lossy().to_string()),
        extension: ext,
        exists: true,
    })
}

pub fn add_message(
    backup: &mut ServerBackup,
    channel_id: &str,
    post_id: &str,
    author: Author,
    content: &str,
    attachment_files: &[PathBuf],
    reply_to_id: Option<String>,
) -> Result<Message, StorageError> {
    let mut staged_attachments = Vec::with_capacity(attachment_files.len());
    for file in attachment_files {
        staged_attachments.push(stage_local_attachment(backup, file)?);
    }

    let ch = backup
        .channels
        .iter_mut()
        .find(|c| c.id == channel_id)
        .ok_or_else(|| StorageError::NotFound(format!("Channel not found: {channel_id}")))?;

    let post = ch
        .posts
        .iter_mut()
        .find(|p| p.id == post_id)
        .ok_or_else(|| StorageError::NotFound(format!("Post not found: {post_id}")))?;

    let msg = Message {
        id: generate_local_id(),
        author,
        content: content.to_string(),
        timestamp: Utc::now().to_rfc3339(),
        attachments: staged_attachments,
        embeds: Vec::new(),
        edited_timestamp: None,
        reply_to_id,
        local_edit_state: "added".to_string(),
    };

    post.messages.push(msg.clone());
    Ok(msg)
}

pub fn edit_message(
    backup: &mut ServerBackup,
    channel_id: &str,
    post_id: &str,
    message_id: &str,
    new_content: &str,
    new_attachment_files: &[PathBuf],
) -> Result<Message, StorageError> {
    let mut staged_attachments = Vec::with_capacity(new_attachment_files.len());
    for file in new_attachment_files {
        staged_attachments.push(stage_local_attachment(backup, file)?);
    }

    let ch = backup
        .channels
        .iter_mut()
        .find(|c| c.id == channel_id)
        .ok_or_else(|| StorageError::NotFound(format!("Channel not found: {channel_id}")))?;

    let post = ch
        .posts
        .iter_mut()
        .find(|p| p.id == post_id)
        .ok_or_else(|| StorageError::NotFound(format!("Post not found: {post_id}")))?;

    let msg = post
        .messages
        .iter_mut()
        .find(|m| m.id == message_id)
        .ok_or_else(|| StorageError::NotFound(format!("Message not found: {message_id}")))?;

    msg.content = new_content.to_string();
    msg.edited_timestamp = Some(Utc::now().to_rfc3339());
    if msg.local_edit_state == "original" {
        msg.local_edit_state = "edited".to_string();
    }
    msg.attachments.extend(staged_attachments);

    Ok(msg.clone())
}

pub fn delete_message(
    backup: &mut ServerBackup,
    channel_id: &str,
    post_id: &str,
    message_id: &str,
) -> Result<bool, StorageError> {
    let ch = backup
        .channels
        .iter_mut()
        .find(|c| c.id == channel_id)
        .ok_or_else(|| StorageError::NotFound(format!("Channel not found: {channel_id}")))?;

    let post = ch
        .posts
        .iter_mut()
        .find(|p| p.id == post_id)
        .ok_or_else(|| StorageError::NotFound(format!("Post not found: {post_id}")))?;

    if let Some(idx) = post.messages.iter().position(|m| m.id == message_id) {
        post.messages.remove(idx);
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn create_post(
    backup: &mut ServerBackup,
    channel_id: &str,
    title: &str,
    author: Author,
    initial_content: &str,
    tag_ids: &[String],
    attachment_files: &[PathBuf],
) -> Result<PostOrThread, StorageError> {
    let post_id = generate_local_id();
    {
        let ch = backup
            .channels
            .iter_mut()
            .find(|c| c.id == channel_id)
            .ok_or_else(|| StorageError::NotFound(format!("Channel not found: {channel_id}")))?;

        let applied_tags: Vec<ForumTag> = ch
            .available_tags
            .iter()
            .filter(|t| tag_ids.contains(&t.id))
            .cloned()
            .collect();

        ch.posts.push(PostOrThread {
            id: post_id.clone(),
            parent_id: Some(ch.id.clone()),
            name: title.to_string(),
            r#type: "thread".to_string(),
            applied_tags,
            messages: Vec::new(),
        });
    }

    add_message(
        backup,
        channel_id,
        &post_id,
        author,
        initial_content,
        attachment_files,
        None,
    )?;

    let ch = backup
        .channels
        .iter()
        .find(|c| c.id == channel_id)
        .unwrap();
    let created = ch.posts.iter().find(|p| p.id == post_id).unwrap().clone();
    Ok(created)
}

fn serialize_embed(embed: &EmbedData) -> Value {
    if !embed.raw.is_empty() && !embed.raw.contains_key("_raw_text") {
        return Value::Object(embed.raw.clone());
    }
    let mut map = Map::new();
    if !embed.title.is_empty() {
        map.insert("title".to_string(), Value::String(embed.title.clone()));
    }
    if !embed.description.is_empty() {
        map.insert(
            "description".to_string(),
            Value::String(embed.description.clone()),
        );
    }
    if !embed.url.is_empty() {
        map.insert("url".to_string(), Value::String(embed.url.clone()));
    }
    if let Some(c) = embed.color {
        map.insert("color".to_string(), json!(c));
    }
    if !embed.author_name.is_empty() {
        map.insert("author".to_string(), json!({ "name": embed.author_name }));
    }
    if !embed.footer_text.is_empty() {
        map.insert("footer".to_string(), json!({ "text": embed.footer_text }));
    }
    if !embed.image_url.is_empty() {
        map.insert("image".to_string(), json!({ "url": embed.image_url }));
    }
    if !embed.thumbnail_url.is_empty() {
        map.insert(
            "thumbnail".to_string(),
            json!({ "url": embed.thumbnail_url }),
        );
    }
    if !embed.fields.is_empty() {
        map.insert("fields".to_string(), json!(embed.fields));
    }
    Value::Object(map)
}

pub fn save_edited_backup(
    backup: &mut ServerBackup,
    target_override: Option<&Path>,
    new_revision: bool,
    revision_suffix: Option<&str>,
) -> Result<PathBuf, StorageError> {
    let source_path = Path::new(&backup.source_path);
    let dest = match target_override {
        Some(p) => p.to_path_buf(),
        None => get_edited_backup_path(source_path, new_revision, revision_suffix),
    };

    let orig_path = Path::new(&backup.original_source_path);
    if dest == orig_path || is_original_backup_path(&dest) {
        return Err(StorageError::ImmutableBackup(
            dest.to_string_lossy().to_string(),
        ));
    }

    let modified_iso = Utc::now().to_rfc3339();

    let channels_json: Vec<Value> = backup
        .channels
        .iter()
        .map(|ch| {
            let posts_json: Vec<Value> = ch
                .posts
                .iter()
                .map(|p| {
                    let msgs_json: Vec<Value> = p
                        .messages
                        .iter()
                        .map(|m| {
                            let mut m_obj = Map::new();
                            m_obj.insert("id".to_string(), json!(m.id));
                            m_obj.insert("type".to_string(), json!("message"));
                            m_obj.insert("author".to_string(), json!(m.author));
                            m_obj.insert("content".to_string(), json!(m.content));
                            m_obj.insert("timestamp".to_string(), json!(m.timestamp));
                            let att_paths: Vec<String> = m
                                .attachments
                                .iter()
                                .map(|a| a.relative_path.clone())
                                .collect();
                            m_obj.insert("attachments".to_string(), json!(att_paths));
                            let embeds_val: Vec<Value> =
                                m.embeds.iter().map(serialize_embed).collect();
                            m_obj.insert("embeds".to_string(), Value::Array(embeds_val));
                            if let Some(ed_ts) = &m.edited_timestamp {
                                m_obj.insert("edited_timestamp".to_string(), json!(ed_ts));
                            }
                            if let Some(rep) = &m.reply_to_id {
                                m_obj.insert("reply_to_id".to_string(), json!(rep));
                            }
                            if m.local_edit_state != "original" {
                                m_obj.insert("local_edit_state".to_string(), json!(m.local_edit_state));
                            }
                            Value::Object(m_obj)
                        })
                        .collect();

                    json!({
                        "id": p.id,
                        "parent_id": p.parent_id,
                        "name": p.name,
                        "type": p.r#type,
                        "applied_tags": p.applied_tags,
                        "messages": msgs_json
                    })
                })
                .collect();

            let mut ch_obj = Map::new();
            ch_obj.insert("id".to_string(), json!(ch.id));
            ch_obj.insert("name".to_string(), json!(ch.name));
            ch_obj.insert("type".to_string(), json!(ch.r#type));
            if let Some(cat) = &ch.category {
                ch_obj.insert("category".to_string(), json!(cat));
            }
            if ch.position != 0 {
                ch_obj.insert("position".to_string(), json!(ch.position));
            }
            if ch.r#type == "forum" || !ch.available_tags.is_empty() {
                ch_obj.insert("available_tags".to_string(), json!(ch.available_tags));
            }
            ch_obj.insert("posts".to_string(), Value::Array(posts_json));
            Value::Object(ch_obj)
        })
        .collect();

    let payload = json!({
        "id": backup.id,
        "name": backup.name,
        "schema_version": 2,
        "based_on_export": backup.based_on_export,
        "last_modified_at": modified_iso,
        "channels": channels_json,
    });

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let formatted = serde_json::to_string_pretty(&payload)?;
    fs::write(&dest, formatted)?;

    backup.source_path = dest.to_string_lossy().to_string();
    backup.is_edited = true;
    backup.last_modified_at = Some(modified_iso);
    backup.schema_version = 2;

    Ok(dest)
}
