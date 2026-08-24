/**
 * `ksor build` (build spec §4 items 1–3, and record spec §5's shrink clause):
 * driven through the built CLI against a conformant record inside a real git
 * repository with a first commit — the shape the spec's acceptance names.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkRecord, type Lock } from "@panaversity/ksor-content/record";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { VALID } from "./__fixtures__/record-conformance.js";

const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/** The conformant record, indexes committed, in a repository with one commit. */
function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-build-"));
  roots.push(root);
  const write = (rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  for (const [rel, text] of Object.entries(VALID.files)) write(rel, text);
  const files = new Map(Object.entries(VALID.files));
  const indexes = checkRecord({ files, dirs: VALID.dirs ?? [] }, { mode: "build" }).indexes;
  for (const [rel, text] of indexes) write(rel, text);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "first");
  return root;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}
function build(root: string, ...args: string[]): Run {
  const r = spawnSync(process.execPath, [distCli, "build", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KSOR_DRAFTS: undefined },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const lockOf = (root: string): Lock =>
  JSON.parse(readFileSync(path.join(root, "build.lock.json"), "utf8")) as Lock;
const AS_OF = "2026-08-25T12:00:00Z";

beforeAll(() => {
  expect(existsSync(distCli), `${distCli} is missing — run pnpm build first`).toBe(true);
});

describe("ksor build — acceptance 1: the conformant record", () => {
  it("exits 0, leaves every index as generated, writes a lock; a second run differs only in as_of; --as-of repeated is byte-identical", () => {
    const root = repo();
    const first = build(root);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toMatch(/build_id sha256:[0-9a-f]{64}/);
    const lock = lockOf(root);
    expect(lock.format).toBe(1);
    expect(lock.source_commit).toBe(git(root, "rev-parse", "HEAD"));
    expect(lock.dirty).toBe(false);
    expect(lock.drafts).toBe("hidden");
    expect(readFileSync(path.join(root, "knowledge/index.md"), "utf8")).toMatch(
      /^---\nokf_version: "0.2"\n---\n/,
    );
    expect(git(root, "status", "--porcelain", "--", "knowledge")).toBe("");
    expect(lock.documents.map((d) => [d.path, d.status, d.admitted])).toEqual([
      ["policies/board-pay.md", "stable", ["internal"]],
      ["policies/old-threshold.md", "deprecated", []],
      // effective_from 2026-09-01 is after now-ish only until then; the lock says so honestly.
      [
        "policies/purchase-approval.md",
        "stable",
        Date.now() < Date.parse("2026-09-01T00:00:00Z") ? [] : ["internal", "public"],
      ],
      ["welcome.md", "draft", []],
    ]);
    expect(lock.companions.map((c) => c.path)).toEqual([
      "welcome.flashcards.yaml",
      "welcome.summary.md",
    ]);
    expect(lock.ledger_ids).toEqual(["2026-08-24T10:00:00Z-aaaaaa", "2026-08-24T11:00:00Z-bbbbbb"]);

    const second = build(root);
    expect(second.status, second.stderr).toBe(0);
    const again = lockOf(root);
    expect({ ...again, as_of: "" }).toEqual({ ...lock, as_of: "" });

    build(root, "--as-of", AS_OF);
    const pinned = readFileSync(path.join(root, "build.lock.json"), "utf8");
    build(root, "--as-of", AS_OF);
    expect(readFileSync(path.join(root, "build.lock.json"), "utf8")).toBe(pinned);
    expect(JSON.parse(pinned).as_of).toBe("2026-08-25T12:00:00.000Z");
  });
});

describe("ksor build — acceptance 1: the emitted starter", () => {
  /**
   * The record every adopter actually gets. Its indexes are COMMITTED by hand
   * in the template, so this is the only thing that can catch them drifting
   * from the generator — `ksor build` writing one here means the scaffold was
   * shipped stale.
   */
  // `ksor init` runs `git init`, so the record is a repository with NO commit
  // before the adopter makes one. That is not a shallow clone: there is no
  // history for a ledger id to disappear from, so the build stamps honestly
  // (dirty, no source_commit) instead of refusing (found live).
  it("builds green in the repository `ksor init` leaves behind, before any commit", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ksor-uncommitted-"));
    roots.push(dir);
    const init = spawnSync(process.execPath, [distCli, "init", "my-sor"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(init.status, init.stderr).toBe(0);
    const root = path.join(dir, "my-sor");
    expect(git(root, "rev-parse", "--is-inside-work-tree")).toBe("true");
    const r = build(root, "--as-of", AS_OF);
    expect(r.status, r.stderr).toBe(0);
    const lock = lockOf(root);
    expect(lock.source_commit).toBeNull();
    expect(lock.dirty).toBe(true);
    // And --strict still says so, by name.
    const strict = build(root, "--as-of", AS_OF, "--strict");
    expect(strict.status).toBe(1);
    expect(strict.stderr.split("\n")[0]).toBe("error: ksor-build-dirty");
  });

  it("builds green on a fresh `ksor init` after its first commit, writing a lock and no index", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ksor-starter-"));
    roots.push(dir);
    const init = spawnSync(process.execPath, [distCli, "init", "my-sor"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(init.status, init.stderr).toBe(0);
    const root = path.join(dir, "my-sor");
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    git(root, "config", "commit.gpgsign", "false");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "first");

    const first = build(root, "--as-of", AS_OF);
    expect(first.status, first.stderr).toBe(0);
    // Not one index rewritten: the committed ones already are what build makes.
    expect(first.stdout).not.toContain("wrote knowledge/");
    expect(git(root, "status", "--porcelain", "--", "knowledge")).toBe("");
    const lock = lockOf(root);
    expect(lock.dirty).toBe(false);
    expect(lock.source_commit).toBe(git(root, "rev-parse", "HEAD"));
    // Every starter document is a draft (a tool may not record a human
    // approval), so nothing reaches a machine surface until the owner approves.
    expect(lock.documents.every((d) => d.status === "draft" && d.admitted.length === 0)).toBe(true);
    expect(readFileSync(path.join(root, "knowledge/index.md"), "utf8")).toMatch(
      /^---\nokf_version: "0.2"\n---\n/,
    );
    // No ledger file at all: the hash of the empty string, and no ids.
    expect(lock.ledger_ids).toEqual([]);

    const pinned = readFileSync(path.join(root, "build.lock.json"), "utf8");
    build(root, "--as-of", AS_OF);
    expect(readFileSync(path.join(root, "build.lock.json"), "utf8")).toBe(pinned);
  });
});

describe("ksor build — acceptance 2: what moves build_id", () => {
  it("a description edit changes that index entry, its hash and build_id; committing the lock leaves source_commit alone", () => {
    const root = repo();
    build(root, "--as-of", AS_OF);
    const before = lockOf(root);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "lock");
    build(root, "--as-of", AS_OF);
    expect(lockOf(root).source_commit).toBe(before.source_commit);
    expect(lockOf(root).build_id).toBe(before.build_id);

    const welcome = path.join(root, "knowledge/welcome.md");
    writeFileSync(
      welcome,
      readFileSync(welcome, "utf8").replace("Where to start.", "Where to begin."),
    );
    const r = build(root, "--as-of", AS_OF);
    expect(r.status, r.stderr).toBe(0);
    const after = lockOf(root);
    expect(after.build_id).not.toBe(before.build_id);
    expect(after.dirty).toBe(true);
    expect(readFileSync(path.join(root, "knowledge/index.md"), "utf8")).toContain(
      "Where to begin.",
    );
    expect(readFileSync(path.join(root, "knowledge/policies/index.md"), "utf8")).toBe(
      `${git(root, "show", "HEAD:knowledge/policies/index.md")}\n`,
    );
    const changed = after.documents.filter(
      (d) => d.sha256 !== before.documents.find((b) => b.path === d.path)?.sha256,
    );
    expect(changed.map((d) => d.path)).toEqual(["welcome.md"]);
  });

  it("appending a ledger entry changes build_id; --as-of across an effectivity boundary changes it, within the same admitted set it does not", () => {
    const root = repo();
    build(root, "--as-of", AS_OF);
    const base = lockOf(root).build_id;
    build(root, "--as-of", "2026-08-26T12:00:00Z");
    expect(lockOf(root).build_id).toBe(base);
    build(root, "--as-of", "2026-09-02T12:00:00Z");
    const effective = lockOf(root);
    expect(effective.build_id).not.toBe(base);
    expect(
      effective.documents.find((d) => d.path === "policies/purchase-approval.md")?.admitted,
    ).toEqual(["internal", "public"]);

    const ledger = path.join(root, ".ksor/takedowns.yaml");
    writeFileSync(
      ledger,
      `${readFileSync(ledger, "utf8")}- id: 2026-08-25T10:00:00Z-cccccc\n  stable_id: knowledge/policies/board-pay\n  scope: node\n  expected: present\n  by: human:ciso\n  at: 2026-08-25T10:00:00Z\n`,
    );
    const r = build(root, "--as-of", AS_OF);
    expect(r.status, r.stderr).toBe(0);
    const denied = lockOf(root);
    expect(denied.build_id).not.toBe(base);
    expect(denied.documents.find((d) => d.path === "policies/board-pay.md")?.admitted).toEqual([]);
    expect(denied.ledger_ids).toHaveLength(3);
  });
});

describe("ksor build — acceptance 3: refusals write nothing", () => {
  it("a checker refusal exits 1 with the slug on the first stderr line, and no index or lock is written", () => {
    const root = repo();
    writeFileSync(path.join(root, "knowledge/bad.md"), "---\ntitle: only\n---\n");
    const r = build(root);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-audience-missing");
    expect(r.stderr).toContain("problem: ksor-missing-key");
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(false);
    expect(git(root, "status", "--porcelain", "--", "knowledge/index.md")).toBe("");
  });

  it("a stale index alone is never a refusal here — build regenerates it", () => {
    const root = repo();
    writeFileSync(path.join(root, "knowledge/index.md"), "# stale\n");
    const r = build(root);
    expect(r.status, r.stderr).toBe(0);
    expect(git(root, "status", "--porcelain", "--", "knowledge/index.md")).toBe("");
    expect(r.stdout).toContain("knowledge/index.md");
  });

  it("a dirty input is refused only under --strict (ksor-build-dirty), and stamped otherwise", () => {
    const root = repo();
    writeFileSync(path.join(root, "knowledge/extra.md"), VALID.files["knowledge/welcome.md"]!);
    const strict = build(root, "--strict");
    expect(strict.status).toBe(1);
    expect(strict.stderr.split("\n")[0]).toBe("error: ksor-build-dirty");
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(false);
    const loose = build(root);
    expect(loose.status, loose.stderr).toBe(0);
    expect(lockOf(root).dirty).toBe(true);
  });
});

describe("ksor build — the ledger against its history (record spec §5)", () => {
  it("a deleted ledger line is refused as ksor-ledger-shrank, naming git history as the baseline", () => {
    const root = repo();
    const ledger = path.join(root, ".ksor/takedowns.yaml");
    const lines = readFileSync(ledger, "utf8");
    writeFileSync(ledger, lines.slice(0, lines.indexOf("- id: 2026-08-24T11:00:00Z-bbbbbb")));
    const r = build(root);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-ledger-shrank");
    expect(r.stderr).toContain("2026-08-24T11:00:00Z-bbbbbb");
    expect(r.stderr).toMatch(/git history/);
  });

  it("a shallow clone refuses ksor-ledger-unverifiable unless --allow-unverifiable-ledger is explicit", () => {
    const origin = repo();
    const shallow = mkdtempSync(path.join(tmpdir(), "ksor-shallow-"));
    roots.push(shallow);
    const clone = spawnSync("git", ["clone", "-q", "--depth", "1", `file://${origin}`, "."], {
      cwd: shallow,
      encoding: "utf8",
    });
    expect(clone.status, clone.stderr).toBe(0);
    const refused = build(shallow);
    expect(refused.status).toBe(1);
    expect(refused.stderr.split("\n")[0]).toBe("error: ksor-ledger-unverifiable");
    const allowed = build(shallow, "--allow-unverifiable-ledger");
    expect(allowed.status, allowed.stderr).toBe(0);
  });

  it("outside any repository the committed lock is the only baseline, source_commit is null and the tree is dirty", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ksor-norepo-"));
    roots.push(root);
    for (const [rel, text] of Object.entries(VALID.files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    }
    const r = build(root, "--as-of", AS_OF);
    expect(r.status, r.stderr).toBe(0);
    expect(lockOf(root).source_commit).toBe(null);
    expect(lockOf(root).dirty).toBe(true);
    writeFileSync(path.join(root, ".ksor/takedowns.yaml"), "");
    const shrank = build(root, "--as-of", AS_OF);
    expect(shrank.stderr.split("\n")[0]).toBe("error: ksor-ledger-shrank");
    expect(shrank.stderr).toContain("build.lock.json");
  });
});

describe("ksor build — arguments", () => {
  it("--instance accepts the file or its directory; no instance anywhere is ksor-instance-missing", () => {
    const root = repo();
    const elsewhere = mkdtempSync(path.join(tmpdir(), "ksor-elsewhere-"));
    roots.push(elsewhere);
    const byFile = spawnSync(
      process.execPath,
      [distCli, "build", "--instance", path.join(root, "instance.md"), "--as-of", AS_OF],
      { cwd: elsewhere, encoding: "utf8" },
    );
    expect(byFile.status, byFile.stderr).toBe(0);
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(true);
    const none = spawnSync(process.execPath, [distCli, "build"], {
      cwd: elsewhere,
      encoding: "utf8",
    });
    expect(none.status).toBe(1);
    expect(none.stderr.split("\n")[0]).toBe("error: ksor-instance-missing");
  });

  it("a bad --as-of is refused before anything is read; --bundles is designed but not implemented", () => {
    const root = repo();
    const bad = build(root, "--as-of", "yesterday");
    expect(bad.status).toBe(1);
    expect(bad.stderr.split("\n")[0]).toBe("error: bad-args");
    const bundles = build(root, "--bundles");
    expect(bundles.status).toBe(2);
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(false);
  });

  it("--help describes the verb and performs nothing", () => {
    const root = repo();
    const r = build(root, "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--as-of");
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(false);
  });
});
