/**
 * The tree-wide half of `remedy.test.ts`: no rule that prints a remedy may
 * write an ESCAPE where it means a character.
 *
 * The behavioural tests hold the two remedies that were caught. This holds the
 * shape, because the defect is a typing habit rather than a bug in one rule —
 * a `\n` inside a backtick-quoted snippet reads correctly in the source and
 * prints as two characters an adopter then pastes into a markdown file. Two
 * independent rules had it, and the next one will too unless something goes
 * red.
 *
 * Scope is every module that CONSTRUCTS a refusal — the record checker, the
 * ingest lock gate, and this repo's own corpus check. Their remedies are
 * pasted into markdown and YAML, never into JavaScript, so an escape there is
 * always the defect. Modules whose remedy is a line of SOURCE (the gateway's
 * `${yourText}\n\n${FLOOR.search}`) are deliberately not in scope: there the
 * escape is what the reader must type.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "..", "..", "..", "..");

/** In source bytes: a backslash escaping a backslash, then `n` — i.e. a printed `\n`. */
const ESCAPED = ["\\\\n", "\\\\t", "\\\\r"] as const;

function remedyFiles(): string[] {
  const record = readdirSync(here)
    .filter((n) => n.endsWith(".ts") && !n.includes(".test."))
    .map((n) => path.join(here, n));
  return [
    ...record,
    path.join(here, "..", "ingest", "lock-gate.ts"),
    path.join(REPO, "scripts", "check-corpus.mjs"),
  ];
}

describe("a remedy prints characters, never escapes", () => {
  it("no refusal-producing module writes an escaped newline, tab or return", () => {
    const offenders: string[] = [];
    for (const file of remedyFiles()) {
      const text = readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if (ESCAPED.some((e) => line.includes(e))) {
          offenders.push(`${path.relative(REPO, file)}:${i + 1}  ${line.trim()}`);
        }
      }
    }
    expect(offenders, `\n${offenders.join("\n")}\n`).toEqual([]);
  });
});
