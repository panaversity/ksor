/**
 * The append-only guarantee, as the SHIPPED gate enforces it.
 *
 * `validate.yml` runs `check.mjs` and nothing else, and the checker's only
 * ledger baseline was the committed `build.lock.json` — an artefact in the same
 * pull request as the ledger, and hand-editable. Reproduced on an emitted
 * scaffold: `rm .ksor/takedowns.yaml` plus `"ledger_entries": []` in the lock
 * printed "ok — the record is well-formed" and exited 0, while the same tree
 * through `ksor build` exited 1 naming both lost ids. So the guarantee record
 * spec §5 promises was, in the artefact adopters actually run, unenforced.
 *
 * The checker now reads git history itself — bare `git log` / `git show`, no
 * install, exactly what `build/git.ts` does — and keeps the lock as a SECOND
 * baseline rather than the only one.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkRecord } from "@panaversity/ksor-content/record";
import { afterAll, describe, expect, it } from "vitest";

import { ledgerFor, lockWith, VALID } from "./__fixtures__/record-conformance.js";

const checker = fileURLToPath(
  new URL("../templates/scaffold/.agents/skills/format-checker/check.mjs", import.meta.url),
);

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): void {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

/** A committed project carrying the conformant record, its ledger and a matching lock. */
function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-check-ledger-"));
  roots.push(root);
  const write = (rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  // The generated indexes first, so the committed record is index-fresh; the
  // fixture's own files then win wherever it declares one.
  const indexes = checkRecord(
    { files: new Map(Object.entries(VALID.files)), dirs: [...(VALID.dirs ?? [])] },
    { mode: "build", ledgerBaselines: [] },
  ).indexes;
  for (const [rel, text] of indexes) if (!(rel in VALID.files)) write(rel, text);
  for (const [rel, text] of Object.entries(VALID.files)) write(rel, text);
  for (const dir of VALID.dirs ?? []) mkdirSync(path.join(root, dir), { recursive: true });
  write("CLAUDE.md", "@AGENTS.md\n");
  write("build.lock.json", lockWith(ledgerFor(VALID.files[".ksor/takedowns.yaml"] ?? "")));
  for (const tree of [".agents", ".claude"]) {
    mkdirSync(path.join(root, tree, "skills", "format-checker"), { recursive: true });
    copyFileSync(checker, path.join(root, tree, "skills", "format-checker", "check.mjs"));
  }
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "T");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "record");
  return root;
}

function check(root: string): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [".agents/skills/format-checker/check.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("the emitted checker judges the ledger against git history too", () => {
  it("is green on the committed record", () => {
    const r = check(repo());
    expect(r.out).toContain("ok");
    expect(r.status).toBe(0);
  });

  it("refuses ksor-ledger-shrank when the ledger AND the lock's baseline are emptied together", () => {
    const root = repo();
    rmSync(path.join(root, ".ksor/takedowns.yaml"));
    writeFileSync(path.join(root, "build.lock.json"), lockWith([]));
    const r = check(root);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain("ksor-ledger-shrank");
    expect(r.out).toContain("2026-08-24T10:00:00Z-aaaaaa");
    expect(r.out).toContain("git history");
  });

  it("refuses ksor-ledger-amended when a committed entry is retargeted and the lock is rewritten to match", () => {
    const root = repo();
    const rel = ".ksor/takedowns.yaml";
    const edited = (VALID.files[rel] ?? "").replace(
      "knowledge/policies/retired",
      "knowledge/policies/purchase-approval",
    );
    writeFileSync(path.join(root, rel), edited);
    writeFileSync(path.join(root, "build.lock.json"), lockWith(ledgerFor(edited)));
    const r = check(root);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain("ksor-ledger-amended");
    expect(r.out).toContain("2026-08-24T10:00:00Z-aaaaaa");
  });

  it("refuses a lock it cannot parse rather than silently dropping the baseline", () => {
    const root = repo();
    writeFileSync(path.join(root, "build.lock.json"), "{ not json");
    const r = check(root);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain("ksor-lock-invalid");
  });

  it("says so when history cannot be read, rather than reporting an unverified ledger as verified", () => {
    const origin = repo();
    const shallow = mkdtempSync(path.join(tmpdir(), "ksor-check-shallow-"));
    roots.push(shallow);
    const clone = spawnSync("git", ["clone", "-q", "--depth", "1", `file://${origin}`, "."], {
      cwd: shallow,
      encoding: "utf8",
    });
    expect(clone.status, clone.stderr).toBe(0);
    const r = check(shallow);
    expect(r.out).toContain("ksor-ledger-unverifiable");
    // The record is otherwise well-formed, so the note is a note and not a
    // refusal: `pnpm check` has no `--allow-unverifiable-ledger` to offer, and
    // a checker that refused every shallow CI checkout would be turned off.
    expect(r.status).toBe(0);
  });
});
