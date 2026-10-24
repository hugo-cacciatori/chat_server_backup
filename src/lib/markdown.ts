import { parseInternalChannelUrl, type InternalServerTarget } from "./links";

export type BlockNode =
  | { type: "heading"; level: 1 | 2 | 3; inlines: InlineNode[] }
  | { type: "code_block"; language: string; code: string }
  | { type: "blockquote"; lines: InlineNode[][] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "paragraph"; inlines: InlineNode[] };

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; code: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "spoiler"; children: InlineNode[] }
  | { type: "external_link"; url: string; label: string }
  | { type: "internal_link"; url: string; target: InternalServerTarget };

export type CodeTokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "Plain";

export interface CodeToken {
  type: CodeTokenType;
  value: string;
}

const CODE_KEYWORDS = new Set([
  "def",
  "class",
  "return",
  "import",
  "from",
  "as",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "try",
  "except",
  "finally",
  "with",
  "async",
  "await",
  "yield",
  "None",
  "True",
  "False",
  "function",
  "const",
  "let",
  "var",
  "interface",
  "type",
  "export",
  "default",
  "fn",
  "pub",
  "struct",
  "enum",
  "impl",
  "match",
  "mut",
  "use",
  "mod",
  "crate",
  "where",
  "null",
  "true",
  "false",
  "void",
  "int",
  "float",
  "double",
  "bool",
  "string",
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "UPDATE",
  "DELETE",
]);

/**
 * Tokenize a single line of source code for lightweight, zero-latency syntax highlighting.
 */
export function tokenizeCodeLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let i = 0;

  while (i < line.length) {
    const rest = line.slice(i);

    // Line comments (#, //, --, %)
    if (rest.startsWith("//") || rest.startsWith("#") || rest.startsWith("--") || rest.startsWith("%")) {
      tokens.push({ type: "comment", value: rest });
      break;
    }

    // Strings ("..." or '...')
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      let end = i + 1;
      while (end < line.length) {
        if (line[end] === "\\" && end + 1 < line.length) {
          end += 2;
          continue;
        }
        if (line[end] === ch) {
          end += 1;
          break;
        }
        end += 1;
      }
      tokens.push({ type: "string", value: line.slice(i, end) });
      i = end;
      continue;
    }

    // Identifiers and keywords
    const wordMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (wordMatch) {
      const word = wordMatch[0];
      tokens.push({
        type: CODE_KEYWORDS.has(word) ? "keyword" : "Plain",
        value: word,
      });
      i += word.length;
      continue;
    }

    // Numbers
    const numMatch = /^\b\d+(?:\.\d+)?\b/.exec(rest);
    if (numMatch) {
      tokens.push({ type: "number", value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    // Plain punctuation / whitespace
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === "Plain") {
      prev.value += ch;
    } else {
      tokens.push({ type: "Plain", value: ch });
    }
    i += 1;
  }

  return tokens;
}

function cleanTrailingUrlPunctuation(rawUrl: string): { clean: string; trailing: string } {
  const match = /^(.*?)([),.!?;:]+)$/.exec(rawUrl);
  if (!match) {
    return { clean: rawUrl, trailing: "" };
  }
  return { clean: match[1], trailing: match[2] };
}

/**
 * Parse inline markdown (code spans, spoilers, bold, underline, italic, strikethrough, and URLs).
 */
export function parseInlines(text: string): InlineNode[] {
  if (!text) {
    return [];
  }

  const pattern =
    /(`[^`\n]+`)|(\|\|[\s\S]+?\|\|)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|([a-zA-Z]+:\/\/[^\s<>"']+)/g;

  const nodes: InlineNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, idx) });
    }

    const full = match[0];
    if (match[1]) {
      nodes.push({ type: "code", code: full.slice(1, -1) });
    } else if (match[2]) {
      nodes.push({ type: "spoiler", children: parseInlines(full.slice(2, -2)) });
    } else if (match[3]) {
      nodes.push({ type: "bold", children: parseInlines(full.slice(2, -2)) });
    } else if (match[4]) {
      nodes.push({ type: "underline", children: parseInlines(full.slice(2, -2)) });
    } else if (match[5]) {
      nodes.push({ type: "strike", children: parseInlines(full.slice(2, -2)) });
    } else if (match[6]) {
      nodes.push({ type: "italic", children: parseInlines(full.slice(1, -1)) });
    } else if (match[7]) {
      const { clean, trailing } = cleanTrailingUrlPunctuation(full);
      const internalTarget = parseInternalChannelUrl(clean);
      if (internalTarget) {
        nodes.push({ type: "internal_link", url: clean, target: internalTarget });
      } else if (clean.startsWith("http://") || clean.startsWith("https://")) {
        nodes.push({ type: "external_link", url: clean, label: clean });
      } else {
        nodes.push({ type: "text", text: clean });
      }
      if (trailing) {
        nodes.push({ type: "text", text: trailing });
      }
    }

    lastIndex = idx + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }

  return nodes;
}

/**
 * Parse a complete message string into block-level and inline-level markdown nodes.
 */
export function parseMarkdownBlocks(content: string): BlockNode[] {
  if (!content) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const blocks: BlockNode[] = [];

  // Split by fenced code blocks first: ```lang\n...\n```
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let lastIdx = 0;

  for (const match of normalized.matchAll(fenceRegex)) {
    const idx = match.index ?? 0;
    if (idx > lastIdx) {
      parseNonCodeSection(normalized.slice(lastIdx, idx), blocks);
    }
    const language = (match[1] || "").trim().toLowerCase();
    const code = (match[2] || "").replace(/\n$/, "");
    blocks.push({ type: "code_block", language, code });
    lastIdx = idx + match[0].length;
  }

  if (lastIdx < normalized.length) {
    parseNonCodeSection(normalized.slice(lastIdx), blocks);
  }

  return blocks;
}

function parseNonCodeSection(section: string, out: BlockNode[]): void {
  const lines = section.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Headings (#, ##, ###)
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      out.push({
        type: "heading",
        level,
        inlines: parseInlines(headingMatch[2]),
      });
      i += 1;
      continue;
    }

    // Blockquotes (> ...)
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: InlineNode[][] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        const stripped = lines[i].replace(/^>\s?/, "");
        quoteLines.push(parseInlines(stripped));
        i += 1;
      }
      out.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    // Unordered list (- or * )
    if (/^\s*[-*]\s+.+$/.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\s*[-*]\s+.+$/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, "");
        items.push(parseInlines(itemText));
        i += 1;
      }
      out.push({ type: "list", ordered: false, items });
      continue;
    }

    // Ordered list (1. )
    if (/^\s*\d+\.\s+.+$/.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\s*\d+\.\s+.+$/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(parseInlines(itemText));
        i += 1;
      }
      out.push({ type: "list", ordered: true, items });
      continue;
    }

    // Paragraph (preserve line breaks inside consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !lines[i].startsWith("> ") &&
      lines[i] !== ">" &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }

    out.push({
      type: "paragraph",
      inlines: parseInlines(paraLines.join("\n")),
    });
  }
}
