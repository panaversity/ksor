// The one frontmatter parser both guards use — two hand-rolled copies had
// already diverged on quote handling once.
//
// Deliberately minimal: top-level `key: value` pairs only. Keys tolerate space
// before the colon (valid YAML that must not bypass key checks); values are
// trimmed and stripped of one pair of matching quotes; a key introducing a
// list (`provenance:` followed by `- item` lines) parses as an empty value.

/** CRLF-normalized frontmatter block body, or null when the file has none. */
function frontmatterBlock(rawText) {
  const text = rawText.replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  return match ? match[1] : null;
}

/** Parsed top-level keys → unquoted values, or null when no frontmatter. */
export function parseFrontmatter(rawText) {
  const block = frontmatterBlock(rawText);
  if (block === null) return null;
  const entries = {};
  for (const line of block.split("\n")) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) entries[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return entries;
}
