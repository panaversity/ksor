/**
 * What makes a file in the record an ATTACHMENT rather than a document.
 *
 * A document may carry study attachments named after it — `x.summary.md` and
 * `x.flashcards.yaml` belong to `x.md` in the same directory. An attachment is
 * PART OF its parent: no route, no sidebar entry, no llms.txt line, no stable
 * id, no MCP node, and its parent's governance rather than its own.
 *
 * This rule is duplicated by construction — the kernel's ingest decides what
 * becomes a node, the site's staging decides what is copied, the site's build
 * decides what is a page, and the record's checker decides what is well-formed.
 * Four readers of one rule is exactly the shape decision 18 names, so this file
 * is canonical and every other copy is asserted against it rather than trusted.
 *
 * A LEAF: no imports, so any of those four can take it without taking anything
 * else with it.
 */

/** The suffix that marks each kind, longest-match first. */
export const ATTACHMENT_SUFFIXES = [
  { suffix: ".summary.md", kind: "summary" },
  { suffix: ".summary.mdx", kind: "summary" },
  { suffix: ".flashcards.yaml", kind: "deck" },
] as const;

export type AttachmentKind = (typeof ATTACHMENT_SUFFIXES)[number]["kind"];

/**
 * The near-miss extensions, refused BY NAME rather than left to fail later.
 *
 * `.yml` is the one an author reaches for by habit, and fumadocs' meta loader
 * accepts `.yaml`/`.json` only — anything else throws `Unknown file type`,
 * naming the path and nothing about the rule (verified in fumadocs-mdx@15.3.0,
 * dist/meta-BR_rkCyY.js). A refusal here costs one line and replaces that.
 */
export const ATTACHMENT_NEAR_MISSES = [
  { suffix: ".flashcards.yml", want: ".flashcards.yaml" },
  { suffix: ".flashcards.json", want: ".flashcards.yaml" },
  { suffix: ".summary.markdown", want: ".summary.md" },
] as const;

/**
 * The attachment kind this file name carries, or null when it is not one.
 *
 * Matched on the whole base name, never on a path: `.summary.md` in a directory
 * called `summary` is not an attachment, and a file called exactly
 * `.summary.md` (a dotfile with no stem) has no parent to attach to and is not
 * one either — the same "a dotfile has no suffix" boundary ingest's isDoc uses.
 */
export function attachmentKindOf(baseName: string): AttachmentKind | null {
  for (const entry of ATTACHMENT_SUFFIXES) {
    if (baseName.length > entry.suffix.length && baseName.endsWith(entry.suffix)) {
      return entry.kind;
    }
  }
  return null;
}

/** True when this file name is an attachment of some document. */
export function isAttachment(baseName: string): boolean {
  return attachmentKindOf(baseName) !== null;
}

/**
 * The base name of the document this attachment belongs to, or null when the
 * name is not an attachment. Always `<stem>.md`: the record is CommonMark, so
 * a parent is a `.md` file even where the attachment itself is `.mdx`.
 */
export function parentDocumentOf(baseName: string): string | null {
  for (const entry of ATTACHMENT_SUFFIXES) {
    if (baseName.length > entry.suffix.length && baseName.endsWith(entry.suffix)) {
      return `${baseName.slice(0, -entry.suffix.length)}.md`;
    }
  }
  return null;
}

/**
 * The extension an author probably meant, when a name is one character off a
 * real attachment. Null when the name is not a near miss.
 */
export function nearMissOf(
  baseName: string,
): { readonly is: string; readonly want: string } | null {
  for (const entry of ATTACHMENT_NEAR_MISSES) {
    if (baseName.length > entry.suffix.length && baseName.endsWith(entry.suffix)) {
      return { is: entry.suffix, want: entry.want };
    }
  }
  return null;
}

/**
 * The cases every implementation of this rule must agree on.
 *
 * The rule lives in four languages — TypeScript here, TypeScript again in the
 * site's staging, a glob in source.config.ts, and plain JS in the record's
 * checker — and the three copies cannot import this file. So the TABLE is the
 * rule, asserted against each implementation, the way AUDIENCE_CASES is
 * (decision 18). A copy that drifts fails on the ROW it broke.
 */
export const ATTACHMENT_CASES = [
  { name: "returns.summary.md", kind: "summary", parent: "returns.md" },
  { name: "returns.flashcards.yaml", kind: "deck", parent: "returns.md" },
  { name: "index.summary.md", kind: "summary", parent: "index.md" },
  // A stem containing dots keeps every one of them: the parent is the same
  // name with the attachment suffix removed, never "up to the first dot".
  { name: "v1.2.policy.summary.md", kind: "summary", parent: "v1.2.policy.md" },
  // Ordinary documents, including ones whose names merely CONTAIN the words.
  { name: "returns.md", kind: null, parent: null },
  { name: "summary.md", kind: null, parent: null },
  { name: "flashcards.yaml", kind: null, parent: null },
  { name: "my-summary.md", kind: null, parent: null },
  // A dotfile with no stem attaches to nothing — refused as an attachment so
  // it is refused as an unexpected file instead, which is the honest error.
  { name: ".summary.md", kind: null, parent: null },
  { name: ".flashcards.yaml", kind: null, parent: null },
  // Case matters: the record already refuses two names differing only in case,
  // so an uppercase suffix is a different file, not the same rule.
  { name: "returns.SUMMARY.md", kind: null, parent: null },
  // Not attachments — near misses, which get their own refusal.
  { name: "returns.flashcards.yml", kind: null, parent: null },
  { name: "returns.flashcards.json", kind: null, parent: null },
] as const;
