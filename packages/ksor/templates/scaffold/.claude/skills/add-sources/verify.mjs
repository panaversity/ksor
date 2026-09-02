#!/usr/bin/env node
// Did the document keep its source's load-bearing values?
//
//   node verify.mjs <extraction.txt> <document.md>
//
// Exit 0 when every load-bearing token in the document's BODY appears in the
// extraction; exit 1 and print each one that does not, one per line.
//
// What "load-bearing" means here: numbers (with their separators — 10,000 and
// 10000 are different claims about the source), dates, codes, and runs of two
// or more capitalised words (a name). Matched case-folded and with whitespace
// collapsed, because an extraction shouts its headings and wraps its lines.
//
// What this proves, and no more: a token that PASSES is present in the source.
// A token that FAILS was changed or introduced — either way, look at it. It
// cannot tell a paraphrase from an invention, and it cannot see a value that
// was dropped. It is a floor under model-driven conversion, which is highest
// fidelity for layout and lowest for exact values (issue #31).
//
// Plain Node, no dependencies, safe to copy: `.agents/skills/` is the owner's.

import { readFileSync } from "node:fs";

const [, , extractionPath, documentPath] = process.argv;
if (!extractionPath || !documentPath) {
  console.error("usage: node verify.mjs <extraction.txt> <document.md>");
  process.exit(2);
}

const fold = (s) => s.toLowerCase().replace(/\s+/g, " ");

const extraction = fold(readFileSync(extractionPath, "utf8"));
const raw = readFileSync(documentPath, "utf8");

// Body only: frontmatter is the agent's own words by design (title,
// description, ids). Footnote labels and definition prefixes are ids too.
const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/\[\^[^\]]+\]:?/g, " ");

const tokens = new Set();
for (const m of body.matchAll(/\d[\d,.:/-]*\d|\d/g)) tokens.add(m[0]);
for (const m of body.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g)) tokens.add(m[0]);

const missing = [...tokens].filter((t) => !extraction.includes(fold(t))).sort();
for (const t of missing) console.log(t);
process.exit(missing.length === 0 ? 0 : 1);
