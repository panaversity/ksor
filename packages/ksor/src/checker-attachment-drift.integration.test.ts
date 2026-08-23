/**
 * The checker's copy of the attachment rule against the canonical one.
 *
 * `check.mjs` is plain JavaScript that an adopter runs with bare node, so it
 * cannot import `attachment-rule.ts` and keeps hand-typed copies of both
 * lists. That is a second reader of one rule, which is precisely the shape
 * decision 18 exists to catch — and it had NO drift test until the quiz was
 * added, so a suffix could have been taught to the site and not to the
 * checker, leaving `pnpm check` blessing a file the build would refuse.
 *
 * Asserted by parsing the literals out of the checker rather than by running
 * it, because what must not drift is the LIST, and a behavioural probe would
 * pass while the list quietly disagreed on an entry no fixture exercised.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_NEAR_MISSES,
  ATTACHMENT_SUFFIXES,
} from "../templates/scaffold/system/site/lib/attachment-rule.js";

const checkerPath = fileURLToPath(
  new URL("../templates/scaffold/.agents/skills/format-checker/check.mjs", import.meta.url),
);
const source = readFileSync(checkerPath, "utf8");

/** The string literals of a named array in the checker's source. */
function literalsOf(name: string): string[] {
  const match = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(source);
  if (match === null) throw new Error(`${name} not found in ${path.basename(checkerPath)}`);
  return [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("the checker's attachment suffixes match the canonical rule", () => {
  it("names exactly the same suffixes, in the same order", () => {
    expect(literalsOf("ATTACHMENT_SUFFIXES")).toEqual(ATTACHMENT_SUFFIXES.map((e) => e.suffix));
  });
});

describe("the checker's near-misses match the canonical rule", () => {
  it("names the same pairs, each pointing at the same correction", () => {
    // The checker stores pairs as flat [is, want] arrays, so the flattened
    // canonical list is the comparable shape.
    const canonical = ATTACHMENT_NEAR_MISSES.flatMap((e) => [e.suffix, e.want]);
    expect(literalsOf("ATTACHMENT_NEAR_MISSES")).toEqual(canonical);
  });
});

describe("the two shipped copies of the checker agree", () => {
  it(".claude/skills mirrors .agents/skills byte for byte", () => {
    const mirror = fileURLToPath(
      new URL("../templates/scaffold/.claude/skills/format-checker/check.mjs", import.meta.url),
    );
    expect(readFileSync(mirror, "utf8")).toBe(source);
  });
});
