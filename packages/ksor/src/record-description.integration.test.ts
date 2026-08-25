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
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(here, "..", "templates", "scaffold", "system", "site");
const YAML = path.resolve(here, "..", "node_modules", "yaml");

/** Node strips types but resolves neither `./x` nor `./x.js` to `x.ts`. */
const RELATIVE_IMPORT = /(from ")(\.{1,2}\/[A-Za-z0-9._/-]+?)(\.js)?(")/g;

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function describeRecord(instanceMd: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-desc-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "instance.md"), instanceMd, "utf8");
  // The modules are COPIED beside the fixture so the child can import them by a
  // literal specifier, with ONE rewrite on the way in: the scaffold writes
  // `from "./governance"` and `from "../record/frontmatter"`, which the bundler
  // resolves by extension and plain Node ESM does not. The specifier is the
  // only thing changed, so what runs here is the same code the site runs.
  // `shared.ts` now reads instance.md through the record's frontmatter
  // splitter (decision 26), so that module and the parser it needs come too.
  mkdirSync(path.join(dir, "lib"));
  mkdirSync(path.join(dir, "record"));
  mkdirSync(path.join(dir, "node_modules"));
  for (const rel of [
    "lib/shared.ts",
    "lib/governance.ts",
    "record/frontmatter.ts",
    // The splitter's YAML shape rules moved out into their own module; a copy
    // list that names files is a list that has to be kept, and a missing one
    // fails as ERR_MODULE_NOT_FOUND naming a temp directory rather than a rule.
    "record/yaml-file.ts",
  ]) {
    writeFileSync(
      path.join(dir, rel),
      readFileSync(path.join(SITE, rel), "utf8").replace(RELATIVE_IMPORT, "$1$2.ts$4"),
      "utf8",
    );
  }
  copyFileSync(path.join(SITE, "record", "refusal.ts"), path.join(dir, "record", "refusal.ts"));
  symlinkSync(YAML, path.join(dir, "node_modules", "yaml"), "dir");
  const script = `
    const { recordDescription } = await import("./lib/shared.ts");
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

const instance = (keys: string): string =>
  `---\nformat: 2\nname: acme-handbook\n${keys}---\n\nThe MCP instructions.\n`;

describe("the description a record publishes for discovery", () => {
  it("uses the record's OWN first sentence, after its display title", () => {
    const out = describeRecord(
      instance(
        "title: Acme Operations Handbook\ndescription: This record is authoritative for expenses, travel and procurement approvals. Everything else is out of scope.\n",
      ),
    );
    expect(out.startsWith("Acme Operations Handbook — This record is authoritative for")).toBe(
      true,
    );
    expect(out.length, "and within the registry schema's cap").toBeLessThanOrEqual(100);
  });

  it("says plainly when the owner has not described it — never a borrowed sentence", () => {
    // The body is the MCP server's instructions, not a description (record
    // spec §3); with no `description:` there is nothing honest to publish.
    const out = describeRecord(instance("title: Knowledge System of Record\n"));
    expect(out).toBe(
      "Knowledge System of Record — its owner has not yet described what this record covers.",
    );
  });

  it("fits the MCP schema's 100-character cap on ServerDetail.description", () => {
    // The registry schema caps it at 100 (2025-12-11). It used to allow 300, so
    // the document a validating client reads became INVALID the moment an owner
    // wrote a real scope sentence — while the 88-character placeholder passed.
    // Silent, and only for records that had been properly described.
    const long = `${"a really long clause ".repeat(40)}end.`;
    const out = describeRecord(instance(`title: Acme\ndescription: ${long}\n`));
    expect(out.length, `over the schema cap: ${out.length} chars — ${out}`).toBeLessThanOrEqual(
      100,
    );
    expect(out.endsWith("\u2026"), "truncation is marked").toBe(true);
    // Every word kept must be a WHOLE word from the source — a naive slice
    // would publish a sentence cut mid-word into a registry listing.
    const words = out
      .replace(/^[^—]*— /, "")
      .replace(/\u2026$/, "")
      .split(" ");
    for (const w of words) {
      expect(["a", "really", "long", "clause", "end."], `truncated mid-word: ${out}`).toContain(w);
    }
  });

  it("keeps a realistic described record inside the cap", () => {
    const out = describeRecord(
      instance(
        'title: Acme Operations Handbook\ndescription: "This record is authoritative for how Acme runs internally: expenses, travel, procurement approvals and the compensation bands the pay review works from."\n',
      ),
    );
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).toContain("Acme Operations Handbook");
  });

  it("collapses a folded description onto one line — this ends up inside JSON", () => {
    const out = describeRecord(
      instance("title: Acme\ndescription: >\n  The record covers\n  procurement\n  and travel.\n"),
    );
    expect(out).toBe("Acme — The record covers procurement and travel.");
    expect(out).not.toContain("\n");
  });

  it("falls back to the record's name when there is no title at all", () => {
    const out = describeRecord(instance(""));
    expect(out).toBe("acme-handbook — its owner has not yet described what this record covers.");
  });
});
