/**
 * What a concept's body says about other things: GFM footnotes (the one
 * extension to CommonMark, record spec §2.3 — per-claim citation keyed on
 * `sources[].id`) and links in both OKF §6.1 forms. The code-stripping is
 * the scaffold checker's, carried because its two review findings (links in
 * fenced and indented code checked as real; a document-wide span strip
 * pairing stray backticks pages apart) are ours to keep closed.
 */
import type { Refusal } from "./refusal.js";

const FOOTNOTE_REF = /\[\^([^\]\s]+)\](?!:)/g;
const FOOTNOTE_DEF = /^[ \t]{0,3}\[\^([^\]\s]+)\]:/gm;

/** Every footnote reference and definition must be keyed on a `sources[].id`. */
export function checkFootnotes(
  path: string,
  body: string,
  sourceIds: readonly string[],
): Refusal[] {
  const prose = stripCode(body);
  const known = new Set(sourceIds);
  const seen = new Set<string>();
  const refusals: Refusal[] = [];
  const report = (label: string, form: string): void => {
    if (known.has(label) || seen.has(label)) return;
    seen.add(label);
    refusals.push({
      slug: "ksor-footnote-unkeyed",
      path,
      why: `the footnote ${form} \`[^${label}]\` matches no \`sources[].id\` — a citation must trace to a declared source`,
      fix: `add a source with \`id: ${label}\`, or change the label to one of: ${[...known].join(", ") || "(none declared)"}`,
    });
  };
  for (const m of prose.matchAll(FOOTNOTE_DEF)) report(m[1] ?? "", "definition");
  for (const m of prose.matchAll(FOOTNOTE_REF)) report(m[1] ?? "", "reference");
  return refusals;
}

// The reference definitions that inline `[text][label]` links point at.
const REFERENCE_DEFINITION =
  /^[ \t]{0,3}\[[^\]^]+\]:[ \t]*(<[^<>\n]*>|\S+)[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))?[ \t]*$/gm;

/**
 * Every inline destination in a body, scanned rather than matched, because
 * link TEXT nests and a regex character class cannot.
 *
 * The class this replaces was `\[[^\]]*\]\(`, which stops at the FIRST `]`.
 * On `[![chart](chart.png)](secret/plan.md)` it therefore saw the image and
 * never the link around it — so a public document could point at a restricted
 * target and escape `ksor-link-widens`, `ksor-link-dead` and
 * `ksor-link-escapes` at once, silently, because no rule ever received the
 * link. A plain `[the [2026] policy](hr/leave.md)` disappeared the same way.
 * Both found in review, 2026-08-25.
 *
 * Every destination is reported, inner and outer: an image inside a link is
 * one link with two targets, and BOTH are governed — the asset is staged and
 * the destination decides the audience.
 */
function inlineDestinations(prose: string): string[] {
  const found: string[] = [];
  const open: number[] = [];
  let i = 0;
  while (i < prose.length) {
    const ch = prose[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[") {
      open.push(i);
      i += 1;
      continue;
    }
    if (ch !== "]") {
      i += 1;
      continue;
    }
    // A `]` with no `[` before it is ordinary text, and so is one whose `(`
    // never closes: neither names a destination, so neither is reported.
    open.pop();
    const parsed = prose[i + 1] === "(" ? destinationAt(prose, i + 2) : null;
    if (parsed === null) {
      i += 1;
      continue;
    }
    found.push(parsed.target);
    i = parsed.end;
  }
  return found;
}

/** The destination that starts just after `](`, or null when it does not close. */
function destinationAt(prose: string, start: number): { target: string; end: number } | null {
  let i = start;
  while (i < prose.length && /\s/.test(prose[i] ?? "")) i += 1;
  let target = "";
  if (prose[i] === "<") {
    const close = prose.indexOf(">", i + 1);
    const newline = prose.indexOf("\n", i + 1);
    if (close === -1 || (newline !== -1 && newline < close)) return null;
    target = prose.slice(i, close + 1);
    i = close + 1;
  } else {
    const from = i;
    while (i < prose.length && !/[\s)]/.test(prose[i] ?? "")) i += 1;
    target = prose.slice(from, i);
    if (target === "") return null;
  }
  // An optional "double", 'single' or (paren) title, then the closing paren.
  while (i < prose.length && /\s/.test(prose[i] ?? "")) i += 1;
  const quote = prose[i];
  if (quote === '"' || quote === "'" || quote === "(") {
    const closer = quote === "(" ? ")" : quote;
    const close = prose.indexOf(closer, i + 1);
    if (close === -1) return null;
    i = close + 1;
    while (i < prose.length && /\s/.test(prose[i] ?? "")) i += 1;
  }
  if (prose[i] !== ")") return null;
  return { target, end: i + 1 };
}

/** The record's own link destinations in a body: no scheme, no `//host`, no bare fragment. */
export function linkTargets(body: string): string[] {
  const prose = stripCode(body);
  const raw: string[] = [];
  raw.push(...inlineDestinations(prose));
  for (const m of prose.matchAll(REFERENCE_DEFINITION)) raw.push(m[1] ?? "");
  return raw
    .map((t) => (t.startsWith("<") && t.endsWith(">") ? t.slice(1, -1).trim() : t))
    .filter(
      (t) =>
        t !== "" && !t.startsWith("#") && !t.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(t),
    );
}

/**
 * The bundle-relative id a link resolves to — bundle-absolute (`/x/y`,
 * against `knowledge/`) or relative (against the source's directory), `.md`
 * optional, fragment and trailing slash dropped. Null when it escapes the
 * bundle.
 */
export function resolveLink(sourceId: string, target: string): string | null {
  const raw = target.split("#")[0] ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed %-escape names nothing; it resolves to a path that does not exist.
  }
  const clean = decoded.replace(/\.md$/, "");
  const base = clean.startsWith("/") ? [] : sourceId.split("/").slice(0, -1);
  const segments = [...base];
  for (const seg of clean.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  return segments.join("/");
}

/**
 * Code is prose about links, never links. Strips fenced blocks (``` and ~~~),
 * indented code after a blank line (list items excepted), and code spans per
 * paragraph.
 */
export function stripCode(text: string): string {
  const kept: string[] = [];
  let fence: { readonly char: string; readonly length: number } | null = null;
  let blank = true;
  let indented = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (fence !== null) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (
        close?.[1] !== undefined &&
        close[1][0] === fence.char &&
        close[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open?.[1] !== undefined) {
      fence = { char: open[1][0] ?? "`", length: open[1].length };
      continue;
    }
    if (/^(?: {4}|\t)/.test(line) && !/^[ \t]+(?:[-*+]|\d+[.)])\s/.test(line)) {
      if (blank || indented) {
        indented = true;
        continue;
      }
    } else if (line.trim() !== "") {
      indented = false;
    }
    blank = line.trim() === "";
    kept.push(line);
  }
  return kept
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/(`+)[^`]*?\1/g, " "))
    .join("\n\n");
}
