use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Author {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub bot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ForumTag {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub moderated: bool,
    #[serde(default)]
    pub emoji: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttachmentRef {
    pub relative_path: String,
    pub filename: String,
    pub resolved_path: Option<String>,
    pub extension: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EmbedField {
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub inline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmbedData {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub color: Option<i64>,
    #[serde(default)]
    pub author_name: String,
    #[serde(default)]
    pub footer_text: String,
    #[serde(default)]
    pub image_url: String,
    #[serde(default)]
    pub thumbnail_url: String,
    #[serde(default)]
    pub fields: Vec<EmbedField>,
    #[serde(default)]
    pub raw: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Message {
    pub id: String,
    pub author: Author,
    pub content: String,
    pub timestamp: String,
    #[serde(default)]
    pub attachments: Vec<AttachmentRef>,
    #[serde(default)]
    pub embeds: Vec<EmbedData>,
    #[serde(default)]
    pub edited_timestamp: Option<String>,
    #[serde(default)]
    pub reply_to_id: Option<String>,
    #[serde(default = "default_edit_state")]
    pub local_edit_state: String,
}

fn default_edit_state() -> String {
    "original".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PostOrThread {
    pub id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub name: String,
    #[serde(default = "default_post_type")]
    pub r#type: String,
    #[serde(default)]
    pub applied_tags: Vec<ForumTag>,
    #[serde(default)]
    pub messages: Vec<Message>,
}

fn default_post_type() -> String {
    "thread".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub r#type: String,
    #[serde(default)]
    pub available_tags: Vec<ForumTag>,
    #[serde(default)]
    pub posts: Vec<PostOrThread>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupDescriptor {
    pub date_label: String,
    pub json_path: String,
    pub is_edited: bool,
    pub display_label: String,
    pub based_on_filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServerBackup {
    pub id: String,
    pub name: String,
    pub date_label: String,
    pub source_path: String,
    pub original_source_path: String,
    pub is_edited: bool,
    pub based_on_export: String,
    #[serde(default)]
    pub last_modified_at: Option<String>,
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub channels: Vec<Channel>,
}

fn default_schema_version() -> u32 {
    1
}
