// heading-aware-1500-content-only-v5 — the eval-locked chunk policy, converted
// verbatim from the oracle (sor-agentfactory @ b554f91,
// sor_content/ingest/chunking.py). Bump CHUNK_POLICY on ANY behavioral change
// here: the policy string is persisted per source row and is the
// carry-forward/skip-gate provenance label, so a silent edit would serve stale
// chunks.
//
// Invariants (each locked by fixtures/chunking.fixture.ts, captured from the
// oracle):
//   - concatenating Chunk.content in ordinal order reproduces the CLEANED body
//     byte-exact (zero chunk overlap — the product invariant);
//   - a code fence is never split at a blank line; only HARD_MAX_CHARS may
//     character-slice;
//   - sourceType decides once per heading-segment; a widget-dominated segment
//     labels ALL its fragments; a split section never orphans a heading piece
//     as nav;
//   - a Docusaurus {#id} becomes the chunk anchor, stripped from the breadcrumb;
//   - H1 (the document title) is dropped from headingPath.
//
// PYTHON-SEMANTICS NOTE (the fidelity core of this port): Python len() and
// slicing count Unicode CODE POINTS (JS counts UTF-16 units), str.splitlines()
// splits on a wider boundary set than \r?\n, and Python \s / str.strip() use
// Python's whitespace set, which differs from JS \s / trim() in BOTH
// directions (\x1c-\x1f and \x85 are whitespace only to Python; \ufeff only to
// JS). The helpers below reproduce each Python set exactly (verified by full
// code-point scans against CPython 3.13 on 2026-08-19) so the v5 policy string
// does NOT need a bump. The Zia widget taxonomy (<Quiz>, <iframe>, "Teaching
// Aid") is likewise carried verbatim: removing it changes chunk labels, which
// is a policy change and would bump the string.

import { createHash } from "node:crypto";

// (constants now live in config.ts — see the re-export below; the oracle's
// config.py (eval-locked constants; changing any is a deliberate, measured
// decision, never a refactor).
// ONE source of truth for the eval-locked constants: config.ts. Re-exported
// here so ingest imports read naturally, but a policy bump edits config.ts
// alone — two copies once stamped sources.chunk_policy and
// retrieval_log.chunk_policy_version from DIFFERENT files, drifting the
// provenance the carry-forward skip-gate rests on (review, 2026-08-19).
export { CHUNK_POLICY, MAX_CHARS, HARD_MAX_CHARS, MIN_CONTENT_CHARS } from "../config.js";
import { MAX_CHARS, HARD_MAX_CHARS, MIN_CONTENT_CHARS } from "../config.js";

// --- Python text semantics, reproduced exactly ------------------------------

/** Python len(): Unicode code points, not UTF-16 units. Every limit comparison
 * and the HARD_MAX_CHARS slice go through code points or the policy silently
 * changes on astral-plane text (emoji, musical symbols, CJK extensions). */
function cpLen(s: string): number {
  let n = 0;
  // eslint-style unused-var-free code-point walk; for..of iterates code points
  for (const _ch of s) n += 1;
  return n;
}

/** Python str.splitlines() boundary set (full code-point scan, 2026-08-19):
 * \n \v \f \r \x1c \x1d \x1e \x85 \u2028 \u2029, with \r\n as one boundary.
 * A naive split(/\r?\n/) changes segmentation on \x85, \u2028 etc. All
 * boundaries are BMP, so a UTF-16 walk cannot land inside a surrogate pair. */
const LINE_BOUNDARY: ReadonlySet<string> = new Set([
  "\n",
  "\v",
  "\f",
  "\r",
  "\x1c",
  "\x1d",
  "\x1e",
  "\x85",
  "\u2028",
  "\u2029",
]);

function pySplitLines(text: string, keepends: boolean): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (LINE_BOUNDARY.has(ch)) {
      let end = i + 1;
      if (ch === "\r" && text[end] === "\n") end += 1;
      out.push(keepends ? text.slice(start, end) : text.slice(start, i));
      start = end;
      i = end;
    } else {
      i += 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** Python's whitespace set — str.isspace() == str.strip() == re \s for str
 * patterns (verified identical by full code-point scan, 2026-08-19). Note the
 * two-way mismatch with JS: \x1c-\x1f and \x85 are whitespace only here;
 * \ufeff is whitespace to JS trim()/\s but NOT to Python. */
const PY_SPACE: ReadonlySet<string> = new Set(
  "\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000",
);

function pyStrip(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && PY_SPACE.has(s[a]!)) a += 1;
  while (b > a && PY_SPACE.has(s[b - 1]!)) b -= 1;
  return s.slice(a, b);
}

/** Character-class text for Python \s (same set as PY_SPACE, for regexes). */
const WS =
  "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
/** Character-class text for Python \w: L* ∪ Nd ∪ Nl ∪ No ∪ {_} — i.e.
 * str.isalnum() plus underscore (spot-verified: é 中 Ⅰ ½ yes; 😀 and combining
 * marks no). Used where the oracle wrote \w or \b (JS \w/\b are ASCII-only). */
const WORD = "\\p{L}\\p{N}_";

// --- the oracle's regexes, with Python semantics made explicit --------------
// Python `.` matches every char except \n (JS `.` also excludes \r \u2028
// \u2029) → [^\n]. Python re.MULTILINE `^` matches only at 0 and after \n (JS
// /m also fires after \r \u2028 \u2029) → (?:^|(?<=\n)). Python `\b` after an
// ASCII name → negative lookahead on the Python word class.

const HEADING = new RegExp(`^(#{1,4})[${WS}]+([^\\n]*?)[${WS}]*$`); // H1..H4 ONLY; H5/H6 are body text
const FENCE = new RegExp(`^ {0,3}(\`{3,}|~{3,})([^\\n]*?)[${WS}]*$`); // ≤3 leading spaces, 3+ ` or ~
const EXPLICIT_ID = new RegExp(`[${WS}]*\\{#([${WORD}-]+)\\}[${WS}]*$`, "u"); // Docusaurus {#id}
const SLUG_RUN = /[^a-z0-9]+/g;
const JSX_ASSESS = new RegExp(`(?:^|(?<=\\n))[${WS}]*<(?:Quiz|Flashcards)(?![${WORD}])`, "u");
const JSX_EMBED = new RegExp(
  `(?:^|(?<=\\n))[${WS}]*<(?:iframe|AICheck|AICheckField|ProjectCard|CapstoneWorkbook)(?![${WORD}])`,
  "u",
);
// A LINE-LEADING <style> opener. LOCKED ORACLE QUIRK: the oracle compiles this
// with ^ and NO re.MULTILINE, so the whole-text fast path in stripStyleBlocks
// only fires when the DOCUMENT's first non-whitespace is <style — a mid-
// document <style> block is not stripped (fixture strip-style-mid-doc-fastpath).
const STYLE_OPEN = new RegExp(`^[${WS}]*<style(?![${WORD}])`, "iu");
// A className attribute in the three forms MDX accepts; leading \s* keeps
// `<div className="x">` from closing up as `<div >`.
const CLASS_ATTR_G = new RegExp(`[${WS}]*className=(?:"[^"]*"|'[^']*'|\\{[^{}]*\\})`, "gu");
// Any layout tag, open or close, attributes captured. Lowercase-only by
// construction: <Quiz> is curriculum and must not be caught here.
const LAYOUT_NAMES = "div|span|section|figure|article|header|footer|main|aside";
const LAYOUT_TAG_G = new RegExp(
  `<[${WS}]*(\\/?)[${WS}]*(${LAYOUT_NAMES})(?![${WORD}])([^<>]*?)(\\/?)[${WS}]*>`,
  "gu",
);
const LAYOUT_TAG_PROBE = new RegExp(
  `<[${WS}]*(\\/?)[${WS}]*(${LAYOUT_NAMES})(?![${WORD}])([^<>]*?)(\\/?)[${WS}]*>`,
  "u",
);
// Inline code, protected before any stripping — `<div>` in prose is a lesson.
const INLINE_CODE_G = new RegExp("`[^`\\n]+`", "g");
// Removing a tag that owned its whole line leaves it blank; collapse the runs.
const BLANK_RUN_G = new RegExp("\\n{3,}", "g");
// (The oracle restores inline-code placeholders with re.sub(r"\x00(\d+)\x00");
// restoreHeld below is the same leftmost-match scan without a control-char
// regex. The oracle's \d is Unicode-digit; placeholders only ever emit ASCII
// digits, so ASCII digits are deliberate — a source file containing a literal
// NUL + non-ASCII digit + NUL would crash the oracle anyway.)
const NUL = "\u0000";
// Subsplit separator: the oracle's re.split(r"(\n\s*\n)", span) with Python \s
// — '\n\x1c\n' IS a blank-line run here (JS \s lacks \x1c; fixture
// exotic-blank-sep-pack locks it).
const BLANK_SEP = new RegExp(`(\\n[${WS}]*\\n)`);

type Fence = readonly [marker: string, run: number] | null;

export type SourceType = "prose" | "nav" | "embed" | "assessment";

export interface Chunk {
  readonly ordinal: number;
  readonly content: string;
  readonly chunkHash: string; // sha256 hex over the UTF-8 content
  readonly headingPath: readonly string[]; // human titles, H2..H4; H1 excluded
  readonly anchor: string | null;
  readonly sourceType: SourceType;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

function slug(title: string, cap = 60): string {
  // After the substitution the string is pure ASCII [a-z0-9-], so .length and
  // .slice are code-point-safe here.
  const s = title
    .toLowerCase()
    .replace(SLUG_RUN, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= cap) return s;
  const cut = s.lastIndexOf("-", cap - 1); // Python s.rfind("-", 0, cap)
  return s.slice(0, cut > 0 ? cut : cap).replace(/^-+|-+$/g, "");
}

export function headingPathText(path: readonly string[]): string {
  return path
    .map((p) => slug(p))
    .filter((s) => s !== "")
    .join("/");
}

/** CommonMark fence tracking (v5 — the correctness core). A backtick fence
 * whose info string contains a backtick is NOT a fence; closing needs the same
 * char, a run at least as long, and nothing but whitespace after. */
function fenceStep(line: string, fence: Fence): Fence {
  const m = FENCE.exec(line);
  if (fence === null) {
    if (m !== null) {
      const marker = m[1]!;
      const info = m[2]!;
      if (marker[0] === "`" && info.includes("`")) return null;
      return [marker[0]!, marker.length];
    }
    return null;
  }
  if (m !== null && m[1]![0] === fence[0] && m[1]!.length >= fence[1] && m[2] === "") return null;
  return fence;
}

/** Drop prose-level `<style>…</style>` CSS — pure presentation; classify would
 * size a multi-KB CSS wall as prose and serve it (the oracle's field-test #3
 * "about" doc opened with ~2KB of it). Runs BEFORE contentHash + chunkText, so
 * chunks reassemble the CLEANED body byte-exact and only files that actually
 * held a block re-embed. FENCE-SAFE: a `<style>` shown as example code inside
 * a fence is content and survives. See STYLE_OPEN for the locked fast-path
 * quirk (^-anchored, no multiline). */
export function stripStyleBlocks(text: string): string {
  if (!STYLE_OPEN.test(text)) return text; // fast path (see STYLE_OPEN quirk note)
  const out: string[] = [];
  let fence: Fence = null;
  let dropping = false;
  for (const line of pySplitLines(text, true)) {
    if (dropping) {
      // inside a multi-line block being dropped — swallow through its close
      if (line.toLowerCase().includes("</style>")) dropping = false;
      continue;
    }
    if (fence === null && STYLE_OPEN.test(line)) {
      // a prose-level opener (never one inside a fence)
      if (!line.toLowerCase().includes("</style>")) dropping = true;
      continue; // drop the opener (single-line block ends here)
    }
    out.push(line);
    fence = fenceStep(line, fence); // track fences on KEPT lines only
  }
  return out.join("");
}

const rstripSpacesTabs = (s: string): string => {
  let b = s.length;
  while (b > 0 && (s[b - 1] === " " || s[b - 1] === "\t")) b -= 1;
  return s.slice(0, b);
};

/** Remove `style={{ ... }}` attributes by BRACE MATCHING, not regex: the value
 * is a JS object literal and the oracle measured 168 of them spanning lines.
 * An unbalanced opener leaves the rest of the text verbatim — a stripper must
 * never eat the rest of a document to satisfy itself. (The pre-attr rstrip of
 * spaces/tabs also glues `<div ` + a KEPT unbalanced `style={{` opener into
 * `<divstyle={{` — an oracle quirk locked by fixture strip-malformed-kept.) */
function stripStyleAttr(text: string): string {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const j = text.indexOf("style={{", i);
    if (j < 0) break;
    out.push(rstripSpacesTabs(text.slice(i, j))); // so `<h3 style={{…}}>` closes up as `<h3>`
    let k = j + "style=".length;
    let depth = 0;
    let closed = false;
    while (k < text.length) {
      const ch = text[k];
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          k += 1;
          closed = true;
          break;
        }
      }
      k += 1;
    }
    if (!closed) {
      // ran off the end with braces still open — malformed; keep it verbatim
      out.push(text.slice(j));
      return out.join("");
    }
    i = k;
  }
  out.push(text.slice(i));
  return out.join("");
}

/** Drop layout tags left BARE by the attribute strip, KEEPING each closer
 * paired with its opener: a closer carries no attributes, so `</div>` cannot
 * say whether it belongs to a removed wrapper or to a kept `<div id="x">`.
 * Track depth; a closer is removed iff its opener was. On any mismatch the tag
 * is KEPT — a stray tag beats eaten content. `stack` is owned by the CALLER
 * and persists across every prose segment of one document: a styled wrapper
 * around a code fence splits at the fence, and its opener/closer land in
 * different segments (228 of them in the oracle's corpus). */
function dropBareLayoutTags(segment: string, stack: Array<[string, boolean]>): string {
  return segment.replace(
    LAYOUT_TAG_G,
    (m0, closing: string, name: string, rawAttrs: string, selfClosing: string) => {
      const attrs = pyStrip(rawAttrs);
      if (closing !== "") {
        const top = stack[stack.length - 1];
        if (top !== undefined && top[0] === name) return stack.pop()![1] ? "" : m0;
        return m0; // unbalanced — keep it rather than guess
      }
      if (selfClosing !== "") return attrs === "" ? "" : m0; // never pushed: opens and closes in one tag
      stack.push([name, attrs === ""]);
      return attrs === "" ? "" : m0;
    },
  );
}

/** Restore NUL<n>NUL placeholders — equivalent to the oracle's
 * re.sub(r"\x00(\d+)\x00", ...): a leftmost scan where a match is a NUL, a
 * maximal non-empty ASCII digit run, and a closing NUL; anything else stays
 * verbatim (backtracking cannot produce any other match for this pattern). */
function restoreHeld(seg: string, held: readonly string[]): string {
  let out = "";
  let i = 0;
  for (;;) {
    const a = seg.indexOf(NUL, i);
    if (a < 0) break;
    let b = a + 1;
    while (b < seg.length && seg[b]! >= "0" && seg[b]! <= "9") b += 1;
    if (b > a + 1 && seg[b] === NUL) {
      const d = seg.slice(a + 1, b);
      const h = held[Number(d)];
      if (h === undefined) {
        throw new Error(
          `inline-code placeholder NUL${d}NUL has no held span (held ${held.length}): ` +
            "the source document contains a literal NUL-digit-NUL sequence, which collides " +
            "with the stripper's placeholder scheme. Remove NUL control characters from the file.",
        );
      }
      out += seg.slice(i, a) + h;
      i = b + 1;
    } else {
      out += seg.slice(i, a + 1);
      i = a + 1;
    }
  }
  return out + seg.slice(i);
}

/** Strip presentation markup from ONE non-fenced segment. Inline code is
 * protected first (`<div>` written in prose backticks is a lesson). `stack` is
 * the document-wide layout-tag stack (see dropBareLayoutTags). */
function stripProsePresentation(segment: string, stack: Array<[string, boolean]>): string {
  const held: string[] = [];
  let seg = segment.replace(INLINE_CODE_G, (m0) => {
    held.push(m0);
    return `${NUL}${held.length - 1}${NUL}`;
  });
  seg = stripStyleAttr(seg).replace(CLASS_ATTR_G, "");
  seg = dropBareLayoutTags(seg, stack);
  seg = seg.replace(BLANK_RUN_G, "\n\n");
  return restoreHeld(seg, held);
}

/** Drop layout markup — `style={{…}}`, `className="…"`, and the `<div>`/
 * `<span>` wrappers they leave bare — while KEEPING every character of the
 * text inside them ("The Third Era of AI Tools" is content, `af-hero-eyebrow`
 * is a CSS hook; the oracle measured a student being served the wrapper).
 * A layout tag is only stripped once it is BARE: attributes go first, and a
 * wrapper with nothing left was pure layout by construction, while
 * `<div id="x">` keeps its tag — no tag allowlist to drift. Deliberately never
 * touches capitalised components (<Quiz> is curriculum), inline SVG, or
 * `<details>`/`<summary>` (semantic HTML). FENCE- and inline-code-safe. ONE
 * layout-tag stack is threaded through every prose segment of the document so
 * pairing survives a fence split. */
export function stripPresentationJsx(text: string): string {
  if (!text.includes("className=") && !text.includes("style={{") && !LAYOUT_TAG_PROBE.test(text)) {
    return text; // fast path — nothing to do, and most pages take it
  }
  const out: string[] = [];
  let buf: string[] = [];
  let fence: Fence = null;
  const stack: Array<[string, boolean]> = [];
  for (const line of pySplitLines(text, true)) {
    const nxt = fenceStep(line, fence);
    if (fence === null && nxt === null) {
      buf.push(line); // a prose line (an opening fence line belongs to the fence)
    } else {
      if (buf.length > 0) {
        out.push(stripProsePresentation(buf.join(""), stack));
        buf = [];
      }
      out.push(line);
    }
    fence = nxt;
  }
  if (buf.length > 0) out.push(stripProsePresentation(buf.join(""), stack));
  return out.join("");
}

/**
 * The body-cleaning pipeline every ingest runs BEFORE the skip-gate hash and
 * chunking, as ONE ordered unit so the order cannot regress. CRLF→LF is
 * normalized FIRST — the strippers are \n-anchored (BLANK_RUN_G = /\n{3,}/),
 * so normalizing AFTER them left a CRLF checkout's blank runs un-collapsed and
 * every chunk_hash + content_hash diverged from an LF checkout, re-embedding
 * the whole file while content_hash claimed nothing changed (review,
 * 2026-08-19). Then style blocks and presentation JSX are stripped so served
 * chunks reassemble the CLEANED body byte-exact. A bare \r (no following \n)
 * stays content.
 */
export function cleanBody(rawBody: string): string {
  return stripPresentationJsx(stripStyleBlocks(rawBody.replaceAll("\r\n", "\n")));
}

/** Heading text never counts toward the nav/prose size test — the
 * "content-only" in the policy name. Note: joins on \n, so exotic line
 * boundaries are normalized before the length is taken (as in the oracle). */
function teachingBody(content: string): string {
  return pyStrip(
    pySplitLines(content, false)
      .filter((ln) => !HEADING.test(ln))
      .join("\n"),
  );
}

/**
 * A line that is navigation rather than prose: strip its list marker and what
 * remains is nothing but links.
 *
 * Deliberately narrow. A line with prose AROUND a link ("Claim within thirty
 * days; see the [expenses page](x) to file.") is prose, because the sentence is
 * the content and the link is incidental.
 */
const NAV_LINE =
  /^(?:[-*+]\s+|\d+[.)]\s+)?(?:\[[^\]]*\]\([^)]*\)|<https?:\/\/[^>]*>|https?:\/\/\S+)(?:[\s,;·|>—–-]*(?:\[[^\]]*\]\([^)]*\)|<https?:\/\/[^>]*>|https?:\/\/\S+))*[\s.,;:]*$/;

/**
 * Is this segment NAVIGATION — a thing that points at content rather than
 * being content?
 *
 * The oracle answered this with length: under 250 code points meant nav.
 * On the curriculum corpus it was tuned against, that proxy holds — a short
 * segment there really is a link list. On a handbook it inverts, because a
 * handbook's most valuable statements are its shortest ("Six months, with a
 * written review at three and six"), and `nav` is excluded from search. Issue
 * #55, walked live on 0.0.14: three of four chunks in an ordinary policy
 * record were unsearchable, and a question the record plainly answered was
 * served the scaffold's placeholder instead.
 *
 * So the question is asked about SHAPE, which is what "navigation" always
 * meant. A segment is nav when link lines are most of it, or when what is left
 * after them is too little to answer anything (MIN_CONTENT_CHARS — the same
 * floor the serving predicate applies, so this never labels `prose` something
 * search would refuse to return anyway).
 *
 * Length is no longer consulted. A 180-character link list is nav and a
 * 51-character fact is prose, which is the ordering length got backwards.
 */
export function isNavShaped(content: string): boolean {
  const lines = pySplitLines(teachingBody(content), false)
    .map((ln) => pyStrip(ln))
    .filter((ln) => ln !== "");
  if (lines.length === 0) return true;
  const navLines = lines.filter((ln) => NAV_LINE.test(ln));
  if (navLines.length * 2 > lines.length) return true;
  const prose = lines.filter((ln) => !NAV_LINE.test(ln)).join(" ");
  return cpLen(prose) < MIN_CONTENT_CHARS;
}

/**
 * Does a line-leading widget DOMINATE this span?
 *
 * The widget regexes match an opening tag only, so the tag's position is where
 * teaching stops and markup begins. The question is therefore about what comes
 * BEFORE it: if that is navigation-shaped, the span is the widget; if it is real
 * explanation, the widget is a minority of a teaching passage.
 *
 * This used to be a length test — 250 characters of teaching body before the
 * widget and the whole span became `assessment`, which no retrieval arm returns.
 * #55 moved navigation from length to shape and left this path behind, so a
 * section carrying 180 characters of real explanation before a `<Quiz>` lost the
 * explanation with it (issue #75).
 */
function dominantWidget(span: string): SourceType | null {
  for (const [re, label] of [
    [JSX_ASSESS, "assessment"],
    [JSX_EMBED, "embed"],
  ] as const) {
    const m = re.exec(span);
    if (m !== null && isNavShaped(span.slice(0, m.index))) return label;
  }
  return null;
}

export function classify(content: string, headingPath: readonly string[]): SourceType {
  const widget = dominantWidget(content);
  if (widget !== null) return widget;
  const leaf = headingPath.length > 0 ? headingPath[headingPath.length - 1]! : "";
  // Declared purpose rather than measured shape: a "Teaching Aid" heading and a
  // slide-deck link say what the section IS. Left on the oracle's taxonomy
  // deliberately — weighing these is a separate policy question.
  if (content.includes("docs.google.com/presentation") || leaf.includes("Teaching Aid")) {
    return "embed";
  }
  if (isNavShaped(content)) return "nav";
  return "prose";
}

/** A segment dominated by a line-leading widget labels EVERY fragment — a
 * char-sliced widget must not leak as prose. Same question as `classify`, asked
 * of the whole segment rather than one piece of it. */
function segmentMarkerType(span: string): SourceType | null {
  return dominantWidget(span);
}

interface Segment {
  readonly path: readonly string[];
  readonly anchor: string | null;
  readonly text: string;
}

/** Walk lines; headings count only OUTSIDE fences; every line lands in exactly
 * one segment (byte-exact). H1 records a title but never enters the path. */
function segmentText(text: string): Segment[] {
  const segments: Segment[] = [];
  const titles = new Map<number, string>();
  const anchors = new Map<number, string | null>();
  let buf: string[] = [];
  let curPath: readonly string[] = [];
  let curAnchor: string | null = null;
  let fence: Fence = null;

  const flush = (): void => {
    if (buf.length > 0) {
      segments.push({ path: [...curPath], anchor: curAnchor, text: buf.join("") });
      buf = [];
    }
  };

  for (const line of pySplitLines(text, true)) {
    const m = fence === null ? HEADING.exec(line) : null;
    if (m !== null) {
      flush();
      const level = m[1]!.length;
      const rawTitle = m[2]!;
      const idM = EXPLICIT_ID.exec(rawTitle);
      const title = idM !== null ? pyStrip(rawTitle.replace(EXPLICIT_ID, "")) : rawTitle;
      titles.set(level, title);
      anchors.set(level, idM !== null ? idM[1]! : null);
      // Snapshot the keys before deleting (the oracle builds a list too).
      const deeper = [...titles.keys()].filter((lv) => lv > level);
      for (const lv of deeper) {
        titles.delete(lv);
        anchors.delete(lv);
      }
      curPath = [...titles.keys()]
        .sort((a, b) => a - b)
        .filter((lv) => lv >= 2 && lv <= level)
        .map((lv) => titles.get(lv)!);
      // An H1 heading yields anchor null (empty path); H2..H4 get the explicit
      // id, else the slug of their own title — which may be "" when the title
      // has no [a-z0-9] at all (Python `or` semantics, fixture emoji-heading).
      curAnchor = curPath.length > 0 ? anchors.get(level) || slug(title) : null;
    }
    buf.push(line); // the heading line belongs to the section it OPENS
    if (m === null) fence = fenceStep(line, fence);
  }
  flush();
  return segments;
}

/** Split on blank-line runs, greedy-pack, but flush ONLY outside a fence — a
 * flush never lands between an open fence and its close. The separator is
 * CAPTURED, so blank-line runs ride along as parts and concatenation is
 * lossless; nothing is trimmed. */
function subsplit(span: string, maxChars: number): string[] {
  if (cpLen(span) <= maxChars) return [span];
  const parts = span.split(BLANK_SEP);
  const pieces: string[] = [];
  let buf = "";
  let bufLen = 0; // code points, tracked incrementally
  let fence: Fence = null;
  for (const part of parts) {
    const partLen = cpLen(part);
    if (buf !== "" && fence === null && bufLen + partLen > maxChars) {
      pieces.push(buf);
      buf = "";
      bufLen = 0;
    }
    buf += part;
    bufLen += partLen;
    for (const line of pySplitLines(part, true)) fence = fenceStep(line, fence);
  }
  if (buf !== "") pieces.push(buf);
  const out: string[] = [];
  for (const piece of pieces) out.push(...enforceCeiling(piece));
  return out;
}

/** The ONLY place mid-line/mid-fence slicing can happen (a pathological single
 * paragraph or giant fence). Slices by CODE POINTS — 4000 UTF-16 units would
 * be a different policy and could split a surrogate pair. */
function enforceCeiling(piece: string): string[] {
  if (cpLen(piece) <= HARD_MAX_CHARS) return [piece];
  const cps = [...piece];
  const out: string[] = [];
  for (let i = 0; i < cps.length; i += HARD_MAX_CHARS) {
    out.push(cps.slice(i, i + HARD_MAX_CHARS).join(""));
  }
  return out;
}

export function chunkText(text: string, maxChars: number = MAX_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  let prefix = ""; // whitespace before the first real chunk attaches forward (byte-exact)

  const emit = (
    content: string,
    path: readonly string[],
    anchor: string | null,
    sourceType: SourceType,
  ): void => {
    chunks.push({
      ordinal: chunks.length,
      content,
      chunkHash: sha256(content),
      headingPath: [...path],
      anchor,
      sourceType,
    });
  };

  for (const seg of segmentText(text)) {
    if (pyStrip(seg.text) === "") {
      // Whitespace-only segment. Carried verbatim from the oracle: the merge-
      // backward branch is unreachable in practice (only the FIRST segment can
      // be whitespace-only — every later segment opens with its heading line).
      if (chunks.length > 0) {
        const last = chunks[chunks.length - 1]!;
        const content = last.content + seg.text;
        chunks[chunks.length - 1] = { ...last, content, chunkHash: sha256(content) };
      } else {
        prefix += seg.text; // nothing emitted yet — hold it
      }
      continue;
    }
    const segIsNav = isNavShaped(seg.text);
    const segMarker = segmentMarkerType(seg.text);
    for (const piece of subsplit(seg.text, maxChars)) {
      let sourceType: SourceType;
      if (segMarker !== null) {
        sourceType = segMarker;
      } else {
        sourceType = classify(piece, seg.path);
        if (sourceType === "nav" && !segIsNav) sourceType = "prose"; // a split section never orphans a heading piece as nav
      }
      const content = prefix !== "" ? prefix + piece : piece;
      prefix = "";
      emit(content, seg.path, seg.anchor, sourceType);
    }
  }
  if (prefix !== "") emit(prefix, [], null, "nav"); // a whitespace-only document
  return chunks;
}
