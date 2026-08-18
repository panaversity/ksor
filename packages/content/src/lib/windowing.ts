/**
 * The document windowing packer — PURE (oracle SC/lib/windowing.py).
 *
 * Invariants carried: greedy WHOLE top-level sections; descend one heading
 * level only when the first section alone exceeds the budget; whole-chunk
 * fallback beneath that; ALWAYS at least one chunk; the window is a
 * CONTIGUOUS ordinal run, so consecutive windows concatenate byte-exact.
 *
 * Every character count here is CODE POINTS (Python `len` parity) — a
 * UTF-16 code-unit count would pack surrogate-pair text differently from
 * the oracle and break the golden fixtures.
 */

import { CHARS_PER_TOKEN } from "../config.js";

export interface DocumentChunk {
  readonly ordinal: number;
  /** The '/'-joined slug breadcrumb ('' for preamble). */
  readonly headingPath: string;
  readonly content: string;
}

export interface Window {
  readonly chunks: readonly DocumentChunk[];
  /** headingPath of the first chunk (null = document start). */
  readonly windowFrom: string | null;
  /** headingPath of the last included chunk. */
  readonly windowTo: string | null;
  /** Where the NEXT window starts (null = document end). */
  readonly nextHeading: string | null;
  /** Top-level sections after the window. */
  readonly remainingSections: readonly string[];
}

/** Python `len` parity: code points, not UTF-16 code units. */
export function codePointLength(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) i += 1;
    n += 1;
  }
  return n;
}

export function estTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function top(headingPath: string, levels = 1): string {
  return headingPath ? headingPath.split("/").slice(0, levels).join("/") : "";
}

function groups(chunks: readonly DocumentChunk[], levels: number): DocumentChunk[][] {
  const out: DocumentChunk[][] = [];
  let key: string | null = null;
  for (const c of chunks) {
    const k = top(c.headingPath, levels);
    if (out.length === 0 || k !== key) {
      out.push([]);
      key = k;
    }
    out[out.length - 1]?.push(c);
  }
  return out;
}

function startIndex(chunks: readonly DocumentChunk[], fromHeading: string | null): number {
  if (fromHeading === null || fromHeading === "") return 0;
  // An ORDINAL-precise cursor (`heading#ordinal`) is emitted when a window
  // split a heading mid-way, so pagination resumes at the NEXT unserved
  // chunk, not the heading's first chunk (oracle review #3 loop). Slugs are
  // kebab-case and never contain '#', so it is an unambiguous delimiter.
  if (fromHeading.includes("#")) {
    const tail = fromHeading.slice(fromHeading.lastIndexOf("#") + 1);
    if (/^\s*[+-]?\d+\s*$/.test(tail)) {
      const ordinal = Number.parseInt(tail.trim(), 10);
      const i = chunks.findIndex((c) => c.ordinal === ordinal);
      if (i !== -1) return i;
      throw new Error(
        `from_heading cursor ${JSON.stringify(fromHeading)} matches no chunk in this scope`,
      );
    }
    // a heading that somehow contains '#' — fall through to the heading match
  }
  const i = chunks.findIndex(
    (c) => c.headingPath === fromHeading || c.headingPath.startsWith(fromHeading + "/"),
  );
  if (i !== -1) return i;
  throw new Error(`from_heading ${JSON.stringify(fromHeading)} matches no section in this scope`);
}

/** Pack a contiguous window from `fromHeading` (or the start) within budgetChars. */
export function windowDocument(
  chunks: readonly DocumentChunk[],
  budgetChars: number,
  fromHeading: string | null = null,
): Window {
  if (chunks.length === 0) throw new Error("cannot window an empty document");
  const tail = chunks.slice(startIndex(chunks, fromHeading));

  const selected: DocumentChunk[] = [];
  let spent = 0;
  for (const group of groups(tail, 1)) {
    const size = group.reduce((n, c) => n + codePointLength(c.content), 0);
    if (selected.length === 0 && size > budgetChars) {
      // descend ONE level inside the first oversized section
      for (const sub of groups(group, 2)) {
        const subSize = sub.reduce((n, c) => n + codePointLength(c.content), 0);
        if (selected.length === 0 && subSize > budgetChars) {
          for (const c of sub) {
            // whole-chunk fallback — always take at least one
            if (selected.length > 0 && spent + codePointLength(c.content) > budgetChars) break;
            selected.push(c);
            spent += codePointLength(c.content);
          }
          break;
        }
        if (spent + subSize > budgetChars) break;
        selected.push(...sub);
        spent += subSize;
      }
      break;
    }
    if (selected.length > 0 && spent + size > budgetChars) break;
    if (size > budgetChars) break; // a later oversized section starts the NEXT window instead
    selected.push(...group);
    spent += size;
  }

  const last = selected[selected.length - 1];
  const first = selected[0];
  if (last === undefined || first === undefined) {
    throw new Error("packer must always emit at least one chunk");
  }
  const after = chunks.filter((c) => c.ordinal > last.ordinal);
  const remaining: string[] = [];
  for (const c of after) {
    const t = top(c.headingPath);
    if (t !== "" && (remaining.length === 0 || remaining[remaining.length - 1] !== t)) {
      remaining.push(t);
    }
  }
  let nextHeading: string | null = null;
  const nxt = after[0];
  if (nxt !== undefined) {
    // If the window ended MID-heading (the next chunk shares the last served
    // chunk's heading), a bare heading cursor would rewind to that heading's
    // FIRST chunk and loop forever — emit an ordinal-precise cursor so the
    // follow-up resumes at the next unserved chunk (oracle review #3).
    nextHeading =
      nxt.headingPath === last.headingPath
        ? `${nxt.headingPath}#${nxt.ordinal}`
        : nxt.headingPath || null;
  }
  return {
    chunks: selected,
    windowFrom: first.headingPath || null,
    windowTo: last.headingPath || null,
    nextHeading,
    remainingSections: remaining,
  };
}

/**
 * Back off to the last blank-line boundary in the second half; used by the
 * search response budget when a hit overflows (the caller stamps
 * `truncated` + a note — loud, never silent). Indices are CODE POINTS,
 * matching the oracle's Python slicing.
 */
export function cleanCut(text: string, limit: number): string {
  const points = Array.from(text);
  if (points.length <= limit) return text;
  // Python str.rfind("\n\n", limit // 2, limit): the whole "\n\n" must lie
  // within [limit//2, limit), so the highest legal start index is limit - 2.
  let cut = -1;
  const floor = Math.floor(limit / 2);
  for (let i = Math.min(limit, points.length) - 2; i >= floor; i -= 1) {
    if (points[i] === "\n" && points[i + 1] === "\n") {
      cut = i;
      break;
    }
  }
  return points.slice(0, cut !== -1 ? cut : limit).join("");
}
