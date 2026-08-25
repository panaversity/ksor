/**
 * What a concept's body says about other things: GFM footnotes (the one
 * extension to CommonMark, record spec §2.3 — per-claim citation keyed on
 * `sources[].id`) and links in both OKF §6.1 forms. The code-stripping is
 * the scaffold checker's, carried because its two review findings (links in
 * fenced and indented code checked as real; a document-wide span strip
 * pairing stray backticks pages apart) are ours to keep closed.
 */
import type { Refusal } from "./refusal";

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
 * The column a line's first non-space character sits at, tabs advancing to the
 * next four-column stop. CommonMark measures block structure in COLUMNS, and a
 * tab-indented continuation paragraph is the same paragraph as a
 * four-space-indented one.
 */
function indentOf(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col += 1;
    else if (ch === "\t") col += 4 - (col % 4);
    else break;
  }
  return col;
}

const LIST_MARKER = /^[ \t]*([-*+]|\d{1,9}[.)])([ \t]*)(.?)/;
/** `* * *` and `- - -`: a thematic break, which takes precedence over the item it looks like. */
const THEMATIC_BREAK = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * The column at which the list item this line opens holds its CONTENT, or null
 * when the line opens no item. Everything indented to that column belongs to
 * the item, and code inside the item starts four columns further right — which
 * is the whole of why the indent below is measured against it.
 */
function itemContentColumn(line: string, indent: number): number | null {
  if (THEMATIC_BREAK.test(line)) return null;
  const m = LIST_MARKER.exec(line);
  if (m === null) return null;
  const marker = m[1] ?? "";
  const spaces = m[2] ?? "";
  const rest = m[3] ?? "";
  // `-x` is a word, not a bullet: a marker is followed by space or line end.
  if (spaces === "" && rest !== "") return null;
  const after = indent + marker.length;
  let padding = 0;
  for (const ch of spaces) padding += ch === "\t" ? 4 - ((after + padding) % 4) : 1;
  // One to four spaces of padding set the content column; five or more open an
  // indented code block INSIDE the item, whose content starts one past the marker.
  return rest === "" || padding > 4 ? after + 1 : after + padding;
}

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

/** The line closing a fence opened with `bar` inside a container at `content`, or null. */
function fenceCloses(
  lines: readonly string[],
  from: number,
  bar: string,
  content: number,
): number | null {
  for (let i = from; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const run = FENCE_CLOSE.exec(line)?.[1];
    if (run === undefined) continue;
    if (run[0] === bar[0] && run.length >= bar.length && indentOf(line) - content <= 3) return i;
  }
  return null;
}

/**
 * Code is prose about links, never links. Strips fenced blocks (``` and ~~~),
 * indented code, and code spans per paragraph — and NOTHING else, because a
 * line this misreads as code is a line no rule judges. `checkFootnotes` and
 * `checkLinks` both read what comes back, so anything wrongly swallowed here
 * escapes `ksor-footnote-unkeyed`, `ksor-link-widens`, `ksor-link-dead` and
 * `ksor-link-escapes` at once, silently — a public document pointing at a
 * restricted one with nothing red. Two shapes did exactly that (review,
 * 2026-08-25), and both are answered by reading indentation the way CommonMark
 * does: from the CONTAINER's content column rather than the line start.
 *
 * Where the exact rule is out of reach the line is KEPT. A link checked inside
 * something that was really code is a false refusal an author can see and fix;
 * a link never checked is a governance hole nothing reports.
 */
export function stripCode(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  /** The content columns of the list items currently open, outermost first. */
  const items: number[] = [];
  let blank = true;
  let indented = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      blank = true;
      kept.push(line);
      continue;
    }
    const indent = indentOf(line);
    const opens = itemContentColumn(line, indent);
    // A block starting left of the open item's content leaves the item, and so
    // does a new marker. A line that merely continues a paragraph — no blank
    // before it, no marker of its own — is a lazy continuation and closes nothing.
    while (items.length > 0 && indent < (items.at(-1) ?? 0) && (blank || opens !== null)) {
      items.pop();
    }
    const content = items.at(-1) ?? 0;
    const relative = indent - content;

    // A fence opens up to three columns past its container's content, so a
    // fenced sample inside a list item is still a fence.
    const open = relative <= 3 ? FENCE_OPEN.exec(line)?.[1] : undefined;
    if (open !== undefined) {
      // An unclosed fence is a stray backtick run, not a block. The state used
      // to survive to end of input, so ONE stray ``` in prose took every link
      // and footnote after it out of both checks — half a document unjudged,
      // with no signal at all. Only the line itself is dropped now, and dropped
      // rather than kept so its backticks cannot pair with a later run in the
      // code-span pass below.
      const close = fenceCloses(lines, i + 1, open, content);
      if (close !== null) {
        i = close;
      } else {
        // That dropped line is still TEXT, so it ends whatever ran before it:
        // an indented code block cannot interrupt a paragraph, and reading the
        // next indented line as code would hide it all over again.
        blank = false;
        indented = false;
      }
      continue;
    }
    // Indented code starts four columns past the CONTAINER's content, never
    // four past the line start: a four-space-indented continuation paragraph is
    // what CommonMark REQUIRES inside a list item, and reading it as code hid
    // its links from every rule. A marker line is never read as code, which
    // only ever checks more.
    if (relative >= 4 && opens === null) {
      if (blank || indented) {
        indented = true;
        continue;
      }
    } else {
      indented = false;
    }
    if (opens !== null) items.push(opens);
    blank = false;
    kept.push(line);
  }
  return kept
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/(`+)[^`]*?\1/g, " "))
    .join("\n\n");
}
