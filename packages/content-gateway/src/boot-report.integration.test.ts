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

/**
 * …and every boot block a DOCUMENT shows is the block the door prints.
 *
 * The width above is asserted against the door's own call sites, which is why
 * moving it from 10 to 12 and adding a `generation` row was green everywhere
 * while `01-hello-world.md` went on showing the old shape — a reader following
 * it saw one thing on the page and another in their terminal, and a second
 * tutorial in the same tree showed the new one. Docs are priority #1, and a
 * pasted block is the part of a tutorial a reader trusts most.
 *
 * So the docs are held to the code: the alignment, and the presence of the
 * `generation` row the door prints on every path — the try and the catch alike.
 */
describe("every boot block in the docs is the shape the door prints", () => {
  const repoRoot = path.join(here, "..", "..", "..");

  /** Every fenced block in the repo's markdown that opens with the boot header. */
  function documentedBlocks(): { file: string; lines: string[] }[] {
    const out: { file: string; lines: string[] }[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("."))
          continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".md")) continue;
        const lines = readFileSync(full, "utf8").split("\n");
        for (let i = 0; i < lines.length; i += 1) {
          if (!(lines[i] ?? "").startsWith("ksor serve · ")) continue;
          const block: string[] = [];
          for (let j = i + 1; j < lines.length && (lines[j] ?? "").startsWith("  "); j += 1) {
            block.push(lines[j] as string);
          }
          out.push({ file: path.relative(repoRoot, full), lines: block });
        }
      }
    };
    walk(repoRoot);
    return out;
  }

  const blocks = documentedBlocks();

  it("finds boot blocks at all — a walk that found none would pass silently", () => {
    expect(blocks.length, "documents showing a `ksor serve` boot block").toBeGreaterThan(0);
  });

  it("every label's value starts at the door's own column", () => {
    const crooked: string[] = [];
    for (const { file, lines } of blocks) {
      for (const line of lines) {
        // The elision a tutorial uses when it quotes part of a block.
        if (line.trim() === "...") continue;
        const body = line.slice(2);
        const label = (/^\S+(?: \S+)?/.exec(body) ?? [""])[0] as string;
        if (label.length >= VALUE_COLUMN) continue; // degrades to one space, by design
        const at = body.length - body.replace(/^\S+(?: \S+)?\s+/, "").length;
        if (at !== VALUE_COLUMN) {
          crooked.push(`${file}: "${label}" value at ${at}, not ${VALUE_COLUMN}`);
        }
      }
    }
    expect(
      crooked,
      `boot block(s) out of step with VALUE_COLUMN (${VALUE_COLUMN}): ${crooked.join("; ")} — ` +
        "re-paste the block from a real `ksor serve`",
    ).toEqual([]);
  });

  it("every block shows the `generation` row, which the door always prints", () => {
    const missing = blocks
      .filter(({ lines }) => !lines.some((l) => l.startsWith("  generation")))
      .map(({ file }) => file);
    expect(
      missing,
      `boot block(s) with no generation row: ${missing.join(", ")} — the door prints one on ` +
        "every path, including the one where it could not resolve it",
    ).toEqual([]);
  });
});
