use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::loader::extract_extension;

const MAX_TEXT_PREVIEW_BYTES: usize = 256 * 1024;
const MAX_TEXT_PREVIEW_LINES: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TextPreview {
    pub content: String,
    pub total_lines: usize,
    pub truncated: bool,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DocxPreview {
    pub paragraphs: Vec<String>,
    pub total_paragraphs: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArchiveEntryInfo {
    pub path: String,
    pub uncompressed_size: u64,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttachmentInspection {
    pub file_size: u64,
    pub extension: String,
    pub kind: String,
    pub text_preview: Option<TextPreview>,
    pub docx_preview: Option<DocxPreview>,
    pub archive_entries: Option<Vec<ArchiveEntryInfo>>,
}

fn is_text_or_code_extension(ext: &str) -> bool {
    matches!(
        ext,
        "txt"
            | "py"
            | "tex"
            | "md"
            | "json"
            | "js"
            | "ts"
            | "tsx"
            | "jsx"
            | "rs"
            | "html"
            | "css"
            | "csv"
            | "log"
            | "yaml"
            | "yml"
            | "toml"
            | "ini"
            | "sh"
            | "ps1"
            | "bat"
            | "c"
            | "cpp"
            | "h"
            | "sql"
            | "xml"
    )
}

fn detect_language_label(ext: &str) -> String {
    match ext {
        "py" => "python",
        "tex" => "latex",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "rs" => "rust",
        "md" => "markdown",
        "sh" | "ps1" | "bat" => "shell",
        other => other,
    }
    .to_string()
}

fn read_text_preview(path: &Path, ext: &str) -> Result<TextPreview, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open text file: {e}"))?;
    let mut buf = Vec::new();
    file.by_ref()
        .take((MAX_TEXT_PREVIEW_BYTES + 1) as u64)
        .read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read text file: {e}"))?;

    let byte_truncated = buf.len() > MAX_TEXT_PREVIEW_BYTES;
    if byte_truncated {
        buf.truncate(MAX_TEXT_PREVIEW_BYTES);
    }

    let raw_text = String::from_utf8_lossy(&buf).replace("\r\n", "\n");
    let all_lines: Vec<&str> = raw_text.lines().collect();
    let total_lines = all_lines.len();
    let line_truncated = total_lines > MAX_TEXT_PREVIEW_LINES;
    let kept_lines = if line_truncated {
        &all_lines[..MAX_TEXT_PREVIEW_LINES]
    } else {
        &all_lines[..]
    };

    Ok(TextPreview {
        content: kept_lines.join("\n"),
        total_lines,
        truncated: byte_truncated || line_truncated,
        language: detect_language_label(ext),
    })
}

/// Extract plain-text paragraphs from a `.docx` file's `word/document.xml` entry.
fn extract_docx_paragraphs(path: &Path) -> Result<DocxPreview, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open docx: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid docx zip container: {e}"))?;

    let mut doc_xml = String::new();
    {
        let mut xml_file = archive
            .by_name("word/document.xml")
            .map_err(|e| format!("word/document.xml not found in docx: {e}"))?;
        xml_file
            .read_to_string(&mut doc_xml)
            .map_err(|e| format!("Failed to read word/document.xml: {e}"))?;
    }

    let mut paragraphs = Vec::new();
    for para_chunk in doc_xml.split("</w:p>") {
        let mut para_text = String::new();
        let mut search_from = 0;
        while let Some(rel_start) = para_chunk[search_from..].find("<w:t") {
            let tag_start = search_from + rel_start;
            if let Some(gt_offset) = para_chunk[tag_start..].find('>') {
                let content_start = tag_start + gt_offset + 1;
                if let Some(end_offset) = para_chunk[content_start..].find("</w:t>") {
                    let text_slice = &para_chunk[content_start..content_start + end_offset];
                    para_text.push_str(&unescape_xml_entities(text_slice));
                    search_from = content_start + end_offset + 6;
                    continue;
                }
            }
            break;
        }
        let trimmed = para_text.trim();
        if !trimmed.is_empty() {
            paragraphs.push(trimmed.to_string());
        }
    }

    let total_paragraphs = paragraphs.len();
    if paragraphs.len() > 150 {
        paragraphs.truncate(150);
    }

    Ok(DocxPreview {
        paragraphs,
        total_paragraphs,
    })
}

fn unescape_xml_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn inspect_zip_archive(path: &Path) -> Result<Vec<ArchiveEntryInfo>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {e}"))?;
    let mut entries = Vec::new();
    let count = archive.len().min(300);

    for idx in 0..count {
        if let Ok(entry) = archive.by_index(idx) {
            entries.push(ArchiveEntryInfo {
                path: entry.name().to_string(),
                uncompressed_size: entry.size(),
                is_dir: entry.is_dir(),
            });
        }
    }
    Ok(entries)
}

fn inspect_7z_archive(path: &Path) -> Result<Vec<ArchiveEntryInfo>, String> {
    let reader = sevenz_rust::SevenZReader::open(path, sevenz_rust::Password::empty())
        .map_err(|e| format!("Failed to open 7z archive: {e}"))?;

    let mut entries = Vec::new();
    for entry in reader.archive().files.iter().take(300) {
        entries.push(ArchiveEntryInfo {
            path: entry.name().to_string(),
            uncompressed_size: entry.size(),
            is_dir: entry.is_directory(),
        });
    }
    Ok(entries)
}

pub fn inspect_attachment_file(path: &Path) -> Result<AttachmentInspection, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Cannot stat {:?}: {e}", path))?;
    let file_size = meta.len();
    let ext = extract_extension(&path.to_string_lossy());

    if is_text_or_code_extension(&ext) {
        let preview = read_text_preview(path, &ext)?;
        return Ok(AttachmentInspection {
            file_size,
            extension: ext,
            kind: "text".to_string(),
            text_preview: Some(preview),
            docx_preview: None,
            archive_entries: None,
        });
    }

    if ext == "docx" {
        let docx = extract_docx_paragraphs(path)?;
        return Ok(AttachmentInspection {
            file_size,
            extension: ext,
            kind: "docx".to_string(),
            text_preview: None,
            docx_preview: Some(docx),
            archive_entries: None,
        });
    }

    if ext == "zip" {
        let entries = inspect_zip_archive(path)?;
        return Ok(AttachmentInspection {
            file_size,
            extension: ext,
            kind: "archive".to_string(),
            text_preview: None,
            docx_preview: None,
            archive_entries: Some(entries),
        });
    }

    if ext == "7z" {
        let entries = inspect_7z_archive(path)?;
        return Ok(AttachmentInspection {
            file_size,
            extension: ext,
            kind: "archive".to_string(),
            text_preview: None,
            docx_preview: None,
            archive_entries: Some(entries),
        });
    }

    if ext == "pdf" {
        return Ok(AttachmentInspection {
            file_size,
            extension: ext,
            kind: "pdf".to_string(),
            text_preview: None,
            docx_preview: None,
            archive_entries: None,
        });
    }

    Ok(AttachmentInspection {
        file_size,
        extension: ext,
        kind: "binary".to_string(),
        text_preview: None,
        docx_preview: None,
        archive_entries: None,
    })
}
