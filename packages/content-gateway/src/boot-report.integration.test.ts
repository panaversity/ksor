/**
 * The boot report's alignment, asserted against the labels the door ACTUALLY
 * prints rather than against a list in a test.
 *
 * `bootLine` can only align a label that FITS its column; anything at or past
 * the width keeps its own length and degrades to a single separating space. So
 * the width is a claim about the whole call-site set, and the two ways it has
 * broken were both invisible to a unit test: an eleven-character label printed
 * `trust floorunverified`, and a label of exactly the width started its value
 * one column right of every shorter one (review finding 63).
 *
 * Reads sibling source, so it is the integration tier however small it is.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { VALUE_COLUMN } from "./boot-report.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Every string literal handed to `bootLine` by the door itself (not by tests). */
function printedLabels(): { label: string; file: string }[] {
  const found: { label: string; file: string }[] = [];
  for (const file of readdirSync(here)) {
    if (!file.endsWith(".ts") || file.includes(".test.")) continue;
    const text = readFileSync(path.join(here, file), "utf8");
    for (const match of text.matchAll(/bootLine\(\s*"([^"]*)"/g)) {
      found.push({ label: match[1]!, file });
    }
  }
  return found;
}

describe("the unauthenticated-public warning is fed the ASK, not the placeholder", () => {
  /**
   * `authPosture` names the restricted tiers an unauthenticated public bind is
   * handing out, and its unit tests assert both branches. What they cannot see
   * is WHICH list the door hands it: `ctx.viewer` holds the fail-closed
   * `[public]` until the boot checks pass, so feeding it that would silently
   * drop the warning on exactly the cold start where the door comes up against
   * a sleeping database — the loudest line downgrading itself for a reason that
   * has nothing to do with the exposure.
   *
   * Source, because the printed line needs a NON-loopback bind to reach this
   * branch, and opening one on a developer's machine to read a string back is
   * not a test worth its side effect.
   */
  it("passes requestedViewer to authPosture", () => {
    const http = readFileSync(path.join(here, "http.ts"), "utf8");
    const call = http.slice(
      http.indexOf("authPosture("),
      http.indexOf("for (const line of keyLines)"),
    );
    expect(call, "the ask, not ctx.viewer").toContain("requestedViewer");
    expect(call, "the placeholder must never feed this warning").not.toContain("ctx.viewer,");
  });
});

describe("the boot report's column fits every label the door prints", () => {
  it("finds the call sites at all — a regex that matched nothing would pass silently", () => {
    expect(printedLabels().length).toBeGreaterThan(5);
  });

  it("keeps every printed label strictly shorter than the value column", () => {
    const overruns = printedLabels()
      .filter(({ label }) => label.length >= VALUE_COLUMN)
      .map(({ label, file }) => `${file}: "${label}" (${label.length})`);
    expect(
      overruns,
      `label(s) at or past VALUE_COLUMN (${VALUE_COLUMN}): ${overruns.join(", ")} — the block ` +
        "stops lining up. Widen VALUE_COLUMN in boot-report.ts, or shorten the label",
    ).toEqual([]);
  });
});
