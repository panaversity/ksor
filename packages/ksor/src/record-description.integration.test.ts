/**
 * What a record says about ITSELF, on the surface agents discover it through.
 *
 * `/.well-known/mcp/server.json` used to carry one hard-coded sentence —
 * byte-identical in every ksor record ever scaffolded — so an agent choosing
 * between records in a registry learned nothing from any of them. The
 * description now comes from the record's own prose, and a record that has none
 * yet says so instead of borrowing a confident sentence it has not earned.
 *
 * Driven in a CHILD PROCESS per fixture, because the scaffold's `shared.ts`
 * resolves instance.md from `process.cwd()` at MODULE LOAD — that is what makes
 * it a static export with no runtime, and it means one process can only ever
 * see one record.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(
  here,
  "..",
  "templates",
  "scaffold",
  "system",
  "site",
  "lib",
  "shared.ts",
);

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function describeRecord(instanceMd: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-desc-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "instance.md"), instanceMd, "utf8");
  // The module is COPIED beside the fixture so the child can import it by a
  // literal specifier: the boundary suite reads import targets out of this
  // file's text, and a computed one would hide the edge from it. `shared.ts`
  // imports only node builtins, so a copy behaves identically.
  copyFileSync(SHARED, path.join(dir, "shared.ts"));
  const script = `
    const { recordDescription } = await import("./shared.ts");
    console.log(recordDescription());
  `;
  return execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings=ExperimentalWarning",
      "--input-type=module",
      "-e",
      script,
    ],
    { cwd: dir, encoding: "utf8" },
  ).trim();
}

const FM = "---\nformat: 1\nname: acme-handbook\n---\n";

describe("the description a record publishes for discovery", () => {
  it("uses the record's OWN first sentence, after its display title", () => {
    const out = describeRecord(
      `${FM}\n# Acme Operations Handbook\n\nThis record is authoritative for expenses, travel and procurement approvals. Everything else is out of scope.\n`,
    );
    expect(out).toBe(
      "Acme Operations Handbook — This record is authoritative for expenses, travel and procurement approvals.",
    );
  });

  it("says plainly when the owner has not described it — never a borrowed sentence", () => {
    // The scaffold's opening paragraphs are AUTHORING guidance ("The heading
    // above is this record's display title…"). Reading one of those as the
    // record's scope is worse than admitting there is none: it publishes
    // instructions-to-the-author as if they described the corpus.
    const out = describeRecord(
      `${FM}\n# Knowledge System of Record\n\nThe heading above is this record's display title.\n\nThis Knowledge System of Record is authoritative for — _fill this in; it is\nthe single most important sentence in the project._\n`,
    );
    expect(out).toBe(
      "Knowledge System of Record — its owner has not yet described what this record covers.",
    );
  });

  it("skips headings, lists and quotes to reach real prose", () => {
    const out = describeRecord(
      `${FM}\n# Acme\n\n## Scope\n\n- not this\n\n> nor this\n\nThe record covers procurement. And more.\n`,
    );
    expect(out).toBe("Acme — The record covers procurement.");
  });

  it("bounds the sentence, so a runaway paragraph cannot become the listing", () => {
    const long = `${"a really long clause ".repeat(40)}end.`;
    const out = describeRecord(`${FM}\n# Acme\n\n${long}\n`);
    expect(out.length).toBeLessThanOrEqual("Acme — ".length + 300);
    expect(out.endsWith("...")).toBe(true);
  });

  it("collapses a wrapped sentence onto one line — this ends up inside JSON", () => {
    const out = describeRecord(`${FM}\n# Acme\n\nThe record covers\nprocurement\nand travel.\n`);
    expect(out).toBe("Acme — The record covers procurement and travel.");
    expect(out).not.toContain("\n");
  });

  it("falls back to the record's name when there is no body at all", () => {
    const out = describeRecord(FM);
    expect(out).toBe("acme-handbook — its owner has not yet described what this record covers.");
  });
});
