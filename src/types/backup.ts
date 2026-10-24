export type ChannelType = "forum" | "text";
export type PostType = "thread" | "channel_stream";
export type EditState = "original" | "added" | "edited";

export interface Author {
  id: string;
  name: string;
  bot: boolean;
}

export interface ForumTag {
  id: string;
  name: string;
  moderated: boolean;
  emoji: string | null;
}

export interface AttachmentRef {
  relative_path: string;
  filename: string;
  resolved_path: string | null;
  extension: string;
  exists: boolean;
}

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedData {
  title: string;
  description: string;
  url: string;
  color: number | null;
  author_name: string;
  footer_text: string;
  image_url: string;
  thumbnail_url: string;
  fields: EmbedField[];
}

export interface Message {
  id: string;
  author: Author;
  content: string;
  timestamp: string;
  attachments: AttachmentRef[];
  embeds: EmbedData[];
  edited_timestamp: string | null;
  reply_to_id: string | null;
  local_edit_state: EditState;
}

export interface PostOrThread {
  id: string;
  parent_id: string | null;
  name: string;
  type: PostType;
  applied_tags: ForumTag[];
  messages: Message[];
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  available_tags: ForumTag[];
  posts: PostOrThread[];
  category: string | null;
  position: number;
}

export interface BackupDescriptor {
  date_label: string;
  json_path: string;
  is_edited: boolean;
  display_label: string;
  based_on_filename: string;
}

export interface ServerBackup {
  id: string;
  name: string;
  date_label: string;
  source_path: string;
  original_source_path: string;
  is_edited: boolean;
  based_on_export: string;
  last_modified_at: string | null;
  schema_version: number;
  channels: Channel[];
}

export interface TextPreview {
  content: string;
  total_lines: number;
  truncated: boolean;
  language: string;
}

export interface DocxPreview {
  paragraphs: string[];
  total_paragraphs: number;
}

export interface ArchiveEntryInfo {
  path: string;
  uncompressed_size: number;
  is_dir: boolean;
}

export interface AttachmentInspection {
  file_size: number;
  extension: string;
  kind: "text" | "docx" | "archive" | "pdf" | "binary" | string;
  text_preview: TextPreview | null;
  docx_preview: DocxPreview | null;
  archive_entries: ArchiveEntryInfo[] | null;
}

export interface BackupMutationResult {
  backup: ServerBackup;
  saved_path: string;
  active_post_id: string | null;
  active_message_id: string | null;
}

export type BotState =
  | "stopped"
  | "starting"
  | "connected"
  | "exporting"
  | "completed"
  | "error";

export interface BotRuntimeStatus {
  state: BotState | string;
  status_text: string;
  bot_username: string | null;
  completed_exports: number;
  last_export_path: string | null;
  last_error: string | null;
  has_token_configured: boolean;
}



