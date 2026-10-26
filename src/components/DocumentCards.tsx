import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { AttachmentInspection, AttachmentRef } from "../types/backup";
import { tokenizeCodeLine } from "../lib/markdown";
import { formatByteSize } from "./MediaCards";

interface DocumentAttachmentCardProps {
  att: AttachmentRef;
  displayName: string;
  assetUrl: string;
  onOpenPdfModal?: (src: string, title: string, filePath?: string | null) => void;
  onOpenFileDefault?: (filePath: string) => void;
  onRevealInExplorer?: (filePath: string) => void;
}

// Attachment files never change in place, so one inspection per path serves every remount
// of a virtualized message card.
const inspectionCache = new Map<string, Promise<AttachmentInspection>>();

function inspectAttachmentCached(path: string): Promise<AttachmentInspection> {
  let pending = inspectionCache.get(path);
  if (!pending) {
    pending = invoke<AttachmentInspection>("inspect_attachment", { path });
    pending.catch(() => inspectionCache.delete(path));
    inspectionCache.set(path, pending);
  }
  return pending;
}

const COLLAPSED_CODE_LINES = 20;
const COLLAPSED_DOCX_PARAGRAPHS = 6;
const COLLAPSED_ARCHIVE_ENTRIES = 12;

export function DocumentAttachmentCard({
  att,
  displayName,
  assetUrl,
  onOpenPdfModal,
  onOpenFileDefault,
  onRevealInExplorer,
}: DocumentAttachmentCardProps) {
  const [inspection, setInspection] = useState<AttachmentInspection | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [inlinePdfOpen, setInlinePdfOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const ext = att.extension.toLowerCase();

  useEffect(() => {
    if (!att.exists || !att.resolved_path) return;
    let cancelled = false;
    inspectAttachmentCached(att.resolved_path)
      .then((info) => {
        if (!cancelled) {
          setInspection(info);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [att.exists, att.resolved_path]);

  const textLines = useMemo(() => {
    const content = inspection?.text_preview?.content;
    if (!content) return [];
    return content.split("\n");
  }, [inspection]);

  // 1. Code & Text Attachment Card (.py, .tex, .txt, .md, .json, etc.)
  if (inspection?.kind === "text" && inspection.text_preview) {
    const tp = inspection.text_preview;
    const shownLines = expanded
      ? textLines
      : textLines.slice(0, COLLAPSED_CODE_LINES);
    const canExpand = textLines.length > COLLAPSED_CODE_LINES;

    const handleCopy = () => {
      navigator.clipboard?.writeText(tp.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    };

    return (
      <div className="mt-2 max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-950/95 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode className="h-4 w-4 shrink-0 text-indigo-400" />
            <span className="truncate font-semibold text-slate-100" title={att.filename}>
              {displayName}
            </span>
            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-indigo-300 ring-1 ring-indigo-500/30">
              {tp.language}
            </span>
            <span className="text-[11px] text-slate-400">
              {tp.total_lines} line{tp.total_lines === 1 ? "" : "s"} •{" "}
              {formatByteSize(inspection.file_size)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            {att.resolved_path && onOpenFileDefault && (
              <button
                type="button"
                onClick={() => onOpenFileDefault(att.resolved_path!)}
                title="Open in default editor"
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            {att.resolved_path && onRevealInExplorer && (
              <button
                type="button"
                onClick={() => onRevealInExplorer(att.resolved_path!)}
                title="Show in Explorer"
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-96 overflow-auto p-3 font-mono text-xs leading-relaxed">
          <table className="w-full border-collapse">
            <tbody>
              {shownLines.map((line, idx) => {
                const tokens = tokenizeCodeLine(line);
                return (
                  <tr key={idx} className="hover:bg-slate-900/50">
                    <td className="w-8 select-none pr-3 text-right text-slate-600">
                      {idx + 1}
                    </td>
                    <td className="whitespace-pre text-slate-200">
                      {tokens.length === 0
                        ? " "
                        : tokens.map((tok, tIdx) => {
                            if (tok.type === "keyword") {
                              return (
                                <span
                                  key={tIdx}
                                  className="font-semibold text-indigo-400"
                                >
                                  {tok.value}
                                </span>
                              );
                            }
                            if (tok.type === "string") {
                              return (
                                <span key={tIdx} className="text-emerald-300">
                                  {tok.value}
                                </span>
                              );
                            }
                            if (tok.type === "comment") {
                              return (
                                <span key={tIdx} className="italic text-slate-500">
                                  {tok.value}
                                </span>
                              );
                            }
                            if (tok.type === "number") {
                              return (
                                <span key={tIdx} className="text-amber-300">
                                  {tok.value}
                                </span>
                              );
                            }
                            return <span key={tIdx}>{tok.value}</span>;
                          })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-800/90 bg-slate-900/60 py-1.5 text-xs font-medium text-indigo-300 hover:bg-slate-900 hover:text-white cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Collapse preview</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Show all {textLines.length} lines</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  // 2. DOCX Document Card with extracted paragraph preview
  if (inspection?.kind === "docx" && inspection.docx_preview) {
    const dp = inspection.docx_preview;
    const shownParas = expanded
      ? dp.paragraphs
      : dp.paragraphs.slice(0, COLLAPSED_DOCX_PARAGRAPHS);
    const canExpand = dp.paragraphs.length > COLLAPSED_DOCX_PARAGRAPHS;

    return (
      <div className="mt-2 max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-2.5 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-sky-400" />
            <span className="truncate font-semibold text-slate-100" title={att.filename}>
              {displayName}
            </span>
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-sky-300 ring-1 ring-sky-500/30">
              DOCX
            </span>
            <span className="text-[11px] text-slate-400">
              {formatByteSize(inspection.file_size)}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {att.resolved_path && onOpenFileDefault && (
              <button
                type="button"
                onClick={() => onOpenFileDefault(att.resolved_path!)}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open</span>
              </button>
            )}
            {att.resolved_path && onRevealInExplorer && (
              <button
                type="button"
                onClick={() => onRevealInExplorer(att.resolved_path!)}
                title="Show in Explorer"
                className="rounded-md bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {dp.paragraphs.length > 0 && (
          <div className="space-y-2 bg-slate-950/60 px-4 py-3 text-xs leading-relaxed text-slate-200">
            {shownParas.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
        )}

        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-800/80 bg-slate-900/60 py-1.5 text-xs font-medium text-indigo-300 hover:bg-slate-900 hover:text-white cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Collapse document preview</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Show all {dp.paragraphs.length} paragraphs</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  // 3. Compressed Archive Card (.7z, .zip) with file tree inspection
  if (inspection?.kind === "archive" && inspection.archive_entries) {
    const entries = inspection.archive_entries;
    const shownEntries = expanded
      ? entries
      : entries.slice(0, COLLAPSED_ARCHIVE_ENTRIES);
    const canExpand = entries.length > COLLAPSED_ARCHIVE_ENTRIES;

    return (
      <div className="mt-2 max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-2.5 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <FileArchive className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="truncate font-semibold text-slate-100" title={att.filename}>
              {displayName}
            </span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber-300 ring-1 ring-amber-500/30">
              {ext}
            </span>
            <span className="text-[11px] text-slate-400">
              {entries.length} item{entries.length === 1 ? "" : "s"} •{" "}
              {formatByteSize(inspection.file_size)}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {att.resolved_path && onOpenFileDefault && (
              <button
                type="button"
                onClick={() => onOpenFileDefault(att.resolved_path!)}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open</span>
              </button>
            )}
            {att.resolved_path && onRevealInExplorer && (
              <button
                type="button"
                onClick={() => onRevealInExplorer(att.resolved_path!)}
                title="Show in Explorer"
                className="rounded-md bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {entries.length > 0 && (
          <div className="max-h-64 overflow-y-auto bg-slate-950/70 px-3.5 py-2 text-xs">
            <table className="w-full border-collapse">
              <tbody>
                {shownEntries.map((item, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-slate-900/80 last:border-0 hover:bg-slate-900/40"
                  >
                    <td className="py-1 pr-3 font-mono text-[11px] text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        {item.is_dir ? (
                          <Folder className="h-3 w-3 text-amber-400 shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                        )}
                        <span className="break-all">{item.path}</span>
                      </span>
                    </td>
                    <td className="w-24 py-1 text-right font-mono text-[11px] text-slate-400">
                      {item.is_dir ? "DIR" : formatByteSize(item.uncompressed_size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-800/80 bg-slate-900/60 py-1.5 text-xs font-medium text-indigo-300 hover:bg-slate-900 hover:text-white cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Show fewer archive entries</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Show all {entries.length} archive entries</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  // 4. PDF Document Card with Inline Preview & Full Modal Reader
  if (ext === "pdf" && att.exists && assetUrl) {
    return (
      <div className="mt-2 max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-100" title={att.filename}>
                {displayName}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 whitespace-nowrap text-[11px] text-slate-400">
                <span className="font-mono uppercase text-rose-300">PDF</span>
                {inspection?.file_size !== undefined && (
                  <>
                    <span>•</span>
                    <span>{formatByteSize(inspection.file_size)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setInlinePdfOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5 text-indigo-400" />
              <span>{inlinePdfOpen ? "Hide Inline" : "Preview Inline"}</span>
            </button>
            {onOpenPdfModal && (
              <button
                type="button"
                onClick={() =>
                  onOpenPdfModal(assetUrl, displayName, att.resolved_path)
                }
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Reader</span>
              </button>
            )}
            {att.resolved_path && onOpenFileDefault && (
              <button
                type="button"
                onClick={() => onOpenFileDefault(att.resolved_path!)}
                title="Open in system PDF viewer"
                className="rounded-md bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            {att.resolved_path && onRevealInExplorer && (
              <button
                type="button"
                onClick={() => onRevealInExplorer(att.resolved_path!)}
                title="Show in Explorer"
                className="rounded-md bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {inlinePdfOpen && (
          <div className="border-t border-slate-800 bg-slate-950 p-2">
            <iframe
              src={assetUrl}
              title={displayName}
              className="h-[460px] w-full rounded-lg border border-slate-800 bg-white"
            />
          </div>
        )}
      </div>
    );
  }

  // 5. Fallback Generic File Card
  return (
    <div className="mt-2 flex max-w-lg flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/75 px-3.5 py-2.5 text-xs shadow-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
          <FileSpreadsheet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-100" title={att.filename}>
            {displayName}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 whitespace-nowrap text-[11px] text-slate-400">
            <span className="font-mono uppercase">{ext || "file"}</span>
            {inspection?.file_size !== undefined && (
              <>
                <span>•</span>
                <span>{formatByteSize(inspection.file_size)}</span>
              </>
            )}
            <span>•</span>
            <span className={att.exists ? "text-emerald-400" : "text-rose-400"}>
              {att.exists ? "Available" : "Missing on disk"}
            </span>
          </div>
        </div>
      </div>

      {att.exists && att.resolved_path && (
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenFileDefault && (
            <button
              type="button"
              onClick={() => onOpenFileDefault(att.resolved_path!)}
              title="Open in default application"
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 transition-colors cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open</span>
            </button>
          )}
          {onRevealInExplorer && (
            <button
              type="button"
              onClick={() => onRevealInExplorer(att.resolved_path!)}
              title="Show in Explorer"
              className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
