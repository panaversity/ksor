// Markdown helpers, converted from the oracle (sor-agentfactory @ b554f91,
// sor_content/ingest/markdown.py). contentHash is the per-file skip-gate
// input: newline-NORMALIZED so a CRLF checkout can't force a phantom
// re-ingest.
//
// This module once carried its own frontmatter split as well. Decision 26 made
// `record/frontmatter.ts` the ONE reader, every caller moved to it, and the
// copy here was left with no importer but its own test.

import { createHash } from "node:crypto";

/** sha256 hex over the CRLF-normalized UTF-8 body. Only \r\n is normalized —
 * a bare \r is content, exactly as in the oracle. */
export function contentHash(body: string): string {
  return createHash("sha256").update(body.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}
