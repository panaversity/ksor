/**
 * A unified diff, so `ksor migrate` can SHOW before it writes — the whole
 * point of a migration verb an owner is meant to review rather than trust.
 * Pure, no dependency: the shapes it must print are files created, deleted
 * and rewritten, and nothing here needs to be a general-purpose diff engine.
 */

export interface FileChange {
  /** Record-relative path. */
  readonly path: string;
  /** null when the file is created. */
  readonly before: string | null;
  /** null when the file is deleted. */
  readonly after: string | null;
  /**
   * A file BUILT from ksor's rules that the adopter is told never to edit (the
   * emitted checker). It is replaced wholesale, and a 1,400-line hunk of a
   * bundle is not review — it is noise that buries the diffs that ARE review.
   */
  readonly generated?: boolean;
}

const CONTEXT = 3;
/**
 * Above this the O(n·m) table stops being worth its memory, and a whole-file
 * hunk says the same thing. Chosen, not measured: no governed markdown in any
 * record this repo has seen is close to it.
 */
const MAX_LINES = 4000;

/** Empty when the file is unchanged. */
export function unifiedDiff(change: FileChange): string {
  if (change.before === change.after) return "";
  const before = lines(change.before);
  const after = lines(change.after);
  const header =
    `--- ${change.before === null ? "/dev/null" : `a/${change.path}`}\n` +
    `+++ ${change.after === null ? "/dev/null" : `b/${change.path}`}\n`;
  if (change.generated === true) {
    return (
      header +
      `@@ generated @@ replaced wholesale: ${before.length} line(s) become ${after.length}. ` +
      "This file is built from ksor's own rules and is never hand-edited.\n"
    );
  }
  return header + hunks(before, after);
}

/** Every change as one text, in path order, with a heading a reader can scan. */
export function renderDiff(changes: readonly FileChange[]): string {
  return [...changes]
    .filter((c) => c.before !== c.after)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((c) => unifiedDiff(c))
    .join("");
}

/** Split keeping no phantom trailing element, so a file ending in `\n` is not "one more line". */
function lines(text: string | null): string[] {
  if (text === null || text === "") return [];
  const out = text.split("\n");
  if (out[out.length - 1] === "") out.pop();
  return out;
}

type Op = readonly ["=" | "-" | "+", string];

function hunks(before: readonly string[], after: readonly string[]): string {
  const ops: Op[] =
    before.length + after.length > MAX_LINES
      ? [...before.map((l) => ["-", l] as Op), ...after.map((l) => ["+", l] as Op)]
      : diffOps(before, after);

  const out: string[] = [];
  let i = 0;
  let beforeLine = 1;
  let afterLine = 1;
  while (i < ops.length) {
    if (ops[i]![0] === "=") {
      beforeLine += 1;
      afterLine += 1;
      i += 1;
      continue;
    }
    // Walk back over the leading context, then forward to the end of the run.
    let start = i;
    let lead = 0;
    while (start > 0 && ops[start - 1]![0] === "=" && lead < CONTEXT) {
      start -= 1;
      lead += 1;
    }
    let end = i;
    let quiet = 0;
    while (end < ops.length && quiet <= CONTEXT * 2) {
      quiet = ops[end]![0] === "=" ? quiet + 1 : 0;
      end += 1;
    }
    while (end > i && ops[end - 1]![0] === "=" && quiet > CONTEXT) {
      end -= 1;
      quiet -= 1;
    }
    const slice = ops.slice(start, end);
    const beforeCount = slice.filter((o) => o[0] !== "+").length;
    const afterCount = slice.filter((o) => o[0] !== "-").length;
    out.push(
      `@@ -${beforeLine - lead},${beforeCount} +${afterLine - lead},${afterCount} @@\n` +
        slice.map(([kind, line]) => `${kind === "=" ? " " : kind}${line}\n`).join(""),
    );
    beforeLine += beforeCount - lead;
    afterLine += afterCount - lead;
    i = end;
  }
  return out.join("");
}

/** Longest common subsequence, the plain dynamic program. */
function diffOps(before: readonly string[], after: readonly string[]): Op[] {
  const n = before.length;
  const m = after.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let a = n - 1; a >= 0; a -= 1) {
    for (let b = m - 1; b >= 0; b -= 1) {
      table[a]![b] =
        before[a] === after[b]
          ? table[a + 1]![b + 1]! + 1
          : Math.max(table[a + 1]![b]!, table[a]![b + 1]!);
    }
  }
  const ops: Op[] = [];
  let a = 0;
  let b = 0;
  while (a < n && b < m) {
    if (before[a] === after[b]) {
      ops.push(["=", before[a]!]);
      a += 1;
      b += 1;
    } else if (table[a + 1]![b]! >= table[a]![b + 1]!) {
      ops.push(["-", before[a]!]);
      a += 1;
    } else {
      ops.push(["+", after[b]!]);
      b += 1;
    }
  }
  while (a < n) ops.push(["-", before[a++]!]);
  while (b < m) ops.push(["+", after[b++]!]);
  return ops;
}
