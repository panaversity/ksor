// Markdown helpers, converted from the oracle (sor-agentfactory @ b554f91,
// sor_content/ingest/markdown.py). contentHash is the per-file skip-gate
// input: newline-NORMALIZED so a CRLF checkout can't force a phantom
// re-ingest.
//
// The oracle's parse_frontmatter YAML-parses the frontmatter into a dict, but
// the kernel build discards it (`del meta` in build.py — taxonomy, summary and
// keywords come from the MANIFEST; frontmatter is the adapter's input). A YAML
// runtime dependency needs a recorded decision (guard rule 5), so this port
// carries only what hashing and chunking depend on: the byte-exact BODY split
// and the raw frontmatter text. The oracle's first_paragraph / keywords_list
// adapter conveniences are likewise left to the adapter slice.
// TODO(coordinator): revisit if an adapter slice needs parsed frontmatter meta.

import { createHash } from "node:crypto";

// Frontmatter must start at byte 0; the pattern consumes at most one newline
// after the closing --- (oracle: r"^---\r?\n(.*?)\r?\n---[ \t]*\r?\n?", DOTALL).
// ^\uFEFF? — a BOM-prefixed file must not serve its YAML as a chunk
// (review finding, 2026-08-19).
const FRONTMATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export interface FrontmatterSplit {
  /** The raw text between the --- fences (unparsed YAML), or null when the
   * document has no frontmatter. */
  readonly frontmatter: string | null;
  /** The body exactly as hashing and chunking must see it — byte-exact. */
  readonly body: string;
}

export function splitFrontmatter(text: string): FrontmatterSplit {
  const m = FRONTMATTER.exec(text);
  if (m === null) return { frontmatter: null, body: text };
  return { frontmatter: m[1]!, body: text.slice(m[0].length) };
}

/** sha256 hex over the CRLF-normalized UTF-8 body. Only \r\n is normalized —
 * a bare \r is content, exactly as in the oracle. */
export function contentHash(body: string): string {
  return createHash("sha256").update(body.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}
