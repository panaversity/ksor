/**
 * The emitted checker is BUILT from the record module (record spec §6), and
 * this is the proof: every record in the conformance fixture is judged by the
 * bundled `check.mjs` — run with bare node from a directory OUTSIDE this
 * repository, so no `node_modules` can quietly supply what the bundle lacks —
 * and by `checkRecord` in-process, and the two must name the same slugs on
 * the same paths. The fixture's own `expected` list is the third leg, so a
 * refusal that both implementations silently dropped would still go red.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkRecord,
  checkScaffoldStructure,
  loadRecord,
  loadScaffoldStructure,
} from "@panaversity/ksor-content/record";
import { afterAll, describe, expect, it } from "vitest";

import { REFUSALS, VALID, type ConformanceRecord } from "./__fixtures__/record-conformance.js";

const checker = fileURLToPath(
  new URL("../templates/scaffold/.agents/skills/format-checker/check.mjs", import.meta.url),
);

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** The indexes the record's own tree generates — what `ksor build` would have committed. */
function committedIndexes(record: ConformanceRecord): ReadonlyMap<string, string> {
  const files = new Map(Object.entries(record.files));
  // Every directory a file implies, plus the empty ones the record names — what the loader would walk.
  const dirs = new Set(record.dirs ?? []);
  for (const rel of files.keys()) {
    for (
      let d = path.posix.dirname(rel);
      d !== "." && d !== "knowledge";
      d = path.posix.dirname(d)
    ) {
      if (d.startsWith("knowledge/")) dirs.add(d);
    }
  }
  return checkRecord({ files, dirs: [...dirs] }, { mode: "build" }).indexes;
}

/** Write a fixture record to a scratch project that also satisfies the structure rules. */
function materialize(record: ConformanceRecord): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-conformance-"));
  roots.push(root);
  const write = (rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  for (const [rel, text] of committedIndexes(record)) if (!(rel in record.files)) write(rel, text);
  for (const [rel, text] of Object.entries(record.files)) write(rel, text);
  for (const dir of record.dirs ?? []) mkdirSync(path.join(root, dir), { recursive: true });
  write("CLAUDE.md", "@AGENTS.md\n");
  for (const tree of [".agents", ".claude"]) {
    mkdirSync(path.join(root, tree, "skills", "format-checker"), { recursive: true });
    copyFileSync(checker, path.join(root, tree, "skills", "format-checker", "check.mjs"));
  }
  return root;
}

/** `<slug> <path>` pairs as the emitted checker printed them. */
function emittedSlugs(root: string): { readonly status: number | null; readonly slugs: string[] } {
  const result = spawnSync(process.execPath, [".agents/skills/format-checker/check.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  const slugs: string[] = [];
  const lines = result.stderr.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s{4}problem: (ksor-[a-z-]+)$/.exec(lines[i] ?? "");
    if (m !== null) slugs.push(`${m[1]} ${(lines[i - 1] ?? "").trim()}`);
  }
  return { status: result.status, slugs: slugs.sort() };
}

function kernelSlugs(root: string): string[] {
  const record = checkRecord(loadRecord(root), { mode: "check" });
  const structure = checkScaffoldStructure(loadScaffoldStructure(root));
  return [...record.refusals, ...structure].map((r) => `${r.slug} ${r.path}`).sort();
}

describe("the emitted check.mjs judges the conformance fixture exactly as the kernel rules do", () => {
  it("is built (run `pnpm build` first) and carries the generated banner", () => {
    expect(existsSync(checker), `${checker} is missing — run pnpm build`).toBe(true);
  });

  it("the conformant record passes both, exit 0", () => {
    const root = materialize(VALID);
    const emitted = emittedSlugs(root);
    expect(emitted.slugs).toEqual([]);
    expect(emitted.status).toBe(0);
    expect(kernelSlugs(root)).toEqual([]);
  });

  it.each(REFUSALS.map((r) => [r.name, r] as const))(
    "%s: same slugs, same paths, exit 1",
    (_name, record) => {
      const root = materialize(record);
      const emitted = emittedSlugs(root);
      const kernel = kernelSlugs(root);
      expect(emitted.slugs).toEqual(kernel);
      expect(kernel).toEqual([...record.expected].sort());
      expect(emitted.status).toBe(1);
    },
  );
});
