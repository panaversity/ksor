/**
 * `ksor build` (build spec §4 items 1–3, and record spec §5's shrink clause):
 * driven through the built CLI against a conformant record inside a real git
 * repository with a first commit — the shape the spec's acceptance names.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkRecord, sha256Hex, type Lock } from "@panaversity/ksor-content/record";
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
  const indexes = checkRecord(
    { files, dirs: VALID.dirs ?? [] },
    { mode: "build", ledgerBaselines: [] },
  ).indexes;
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
    expect(lock.ledger_entries.map((e: { id: string }) => e.id)).toEqual([
      "2026-08-24T10:00:00Z-aaaaaa",
      "2026-08-24T11:00:00Z-bbbbbb",
    ]);

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
    // Every starter document PUBLISHES: the samples ship `status: stable`,
    // approved by the producer that generated them and authorised by the
    // emitted policy, so a fresh record has a machine surface on its first
    // build rather than an empty one (decision 27 revision 2026-08-25). The
    // approver is a producer, never a person — `human:you` in the same policy
    // is the placeholder the owner replaces, and it approved nothing.
    expect(lock.documents.map((d) => [d.path, d.status, d.admitted])).toEqual([
      ["governance-ladder.md", "stable", ["public"]],
      ["surfaces/for-agents.md", "stable", ["public"]],
      ["surfaces/for-people.md", "stable", ["public"]],
      ["surfaces/overview.md", "stable", ["public"]],
      ["what-is-a-ksor.md", "stable", ["public"]],
    ]);
    expect(readFileSync(path.join(root, "knowledge/index.md"), "utf8")).toMatch(
      /^---\nokf_version: "0.2"\n---\n/,
    );
    // No ledger file at all: the hash of the empty string, and no ids.
    expect(lock.ledger_entries).toEqual([]);

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
    expect(denied.ledger_entries).toHaveLength(3);
  });
});

/**
 * The invariant is "same corpus tree + same toolchain ⇒ same `build_id`", and
 * `--as-of` defaults to `Date.now()`. `buildIdOf` does not hash `as_of`, but it
 * DOES hash `documents[].admitted`, which `admittedViewersOf` computes AT
 * `asOf` — so the invariant is unconditional only for a tree that declares no
 * lifecycle instant, and time-dependent BY DESIGN for one that does (crossing
 * an `effective_from` changes what was published, and the id must say so).
 * Both halves are asserted, because neither is safe to assume from the other.
 */
describe("ksor build — what `as_of` does and does not move", () => {
  it("moves nothing at all when no concept declares a lifecycle instant", () => {
    const root = repo();
    const abs = path.join(root, "knowledge/policies/purchase-approval.md");
    writeFileSync(
      abs,
      readFileSync(abs, "utf8")
        .split("\n")
        .filter((l) => !/^\s*(stale_after|effective_from):/.test(l))
        .join("\n"),
    );
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "no lifecycle instants");

    build(root, "--as-of", "2020-01-01T00:00:00Z");
    const early = lockOf(root);
    build(root, "--as-of", "2030-01-01T00:00:00Z");
    const late = lockOf(root);
    expect(late.build_id, "a decade apart, over a tree with no lifecycle instant").toBe(
      early.build_id,
    );
    expect(late.documents.map((d) => d.admitted)).toEqual(early.documents.map((d) => d.admitted));

    // And the invariant's own stated test: build twice, diff the lock.
    const first = build(root);
    expect(first.status, first.stderr).toBe(0);
    const a = lockOf(root);
    expect(build(root).status).toBe(0);
    const b = lockOf(root);
    expect(b.build_id).toBe(a.build_id);
    expect({ ...b, as_of: "" }).toEqual({ ...a, as_of: "" });
  });
});

/**
 * The attachment rule has ONE implementation (`packages/content/src/lib/
 * attachment-rule.ts`, whose header calls itself canonical) and this package
 * must not carry a hand copy of the suffix list.
 *
 * It has now regressed FOUR times. This branch already removed "a third hand
 * copy of the attachment list that had already drifted", and two more were
 * still here afterwards — `build/index.ts`'s lock filter and `migrate/index.ts`'s
 * `COMPANION` — each carrying the SAME `.summary.mdx` gap the removed one had.
 *
 * Neither was observable: `loadRecord` admits only `/\.(md|yaml)$/` (load.ts),
 * so `.mdx` never reaches `record.files`, and `hygiene.ts` refuses a
 * dot-prefixed base name, so the other divergence (`attachmentKindOf` requires a
 * stem, a regex does not) cannot be reached either. Both masks live in
 * DIFFERENT modules from the copies they hide, which is decision 18's shape
 * exactly — each side internally consistent, the rule drifting between them.
 * A behavioural test therefore cannot catch this; the existence of a copy is
 * the defect, so the copy is what is asserted against.
 */
describe("the attachment rule is not re-implemented in this package", () => {
  /**
   * Two or more of these on ONE line is a hand-written attachment list. The
   * leading dot is left off and backslashes are stripped first, so the regex
   * form (`\\.(summary\\.md|flashcards\\.yaml|…)`) and a plain array of
   * suffixes are both caught by the same rule. `summary.mdx` is not listed
   * separately: it CONTAINS `summary.md`, so listing both would score a line
   * that names only the mdx form twice.
   */
  const MARKERS = ["summary.md", "flashcards.yaml", "quiz.yaml", "slides.yaml"];
  /** Comments blanked, backslashes dropped: prose ABOUT the rule is not a copy OF it. */
  const code = (text: string): string =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replaceAll("\\", "");

  const sources = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sources(abs));
      else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) out.push(abs);
    }
    return out;
  };

  it("no module spells the suffix list out for itself", () => {
    const src = fileURLToPath(new URL(".", import.meta.url));
    const offenders = sources(src).flatMap((file) =>
      code(readFileSync(file, "utf8"))
        .split("\n")
        .map((line, i) => ({ line: line.trim(), at: i + 1 }))
        .filter(({ line }) => MARKERS.filter((m) => line.includes(m)).length >= 2)
        .map(({ line, at }) => `${path.relative(src, file)}:${at}  ${line}`),
    );
    expect(
      offenders,
      "each of these re-implements the attachment rule — import `attachmentKindOf` from " +
        "`@panaversity/ksor-content` instead, so there is one list to keep right",
    ).toEqual([]);
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

  /**
   * `dirty` was read BEFORE the indexes were rewritten, and `knowledge/` is
   * one of the four inputs it is read over — so a build that regenerated a
   * committed-but-stale index stamped `dirty: false` and a `source_commit`
   * that does not contain the tree it had just published, and `--strict`,
   * documented as stamping only committed content, exited 0 having made the
   * working tree dirty. The state is ordinary: a stale index is never a
   * refusal in build mode, so a title edit committed without a rebuild
   * reaches this exactly.
   */
  it("a stale COMMITTED index is uncommitted output: --strict refuses it, and a loose build stamps dirty", () => {
    const root = repo();
    writeFileSync(path.join(root, "knowledge/index.md"), "# stale\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "commit the stale index");
    expect(git(root, "status", "--porcelain")).toBe("");

    const strict = build(root, "--strict", "--as-of", AS_OF);
    expect(strict.status, strict.stdout + strict.stderr).toBe(1);
    expect(strict.stderr.split("\n")[0]).toBe("error: ksor-build-dirty");
    expect(strict.stderr).toContain("knowledge/index.md");
    // A refusal writes nothing, the tree included.
    expect(git(root, "status", "--porcelain")).toBe("");

    const loose = build(root, "--as-of", AS_OF);
    expect(loose.status, loose.stderr).toBe(0);
    expect(loose.stdout).toContain("wrote knowledge/index.md");
    expect(lockOf(root).dirty).toBe(true);
  });
});

describe("ksor build — assets are part of what was checked", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );

  /**
   * Assets were absent from the lock entirely, so the bytes a site publishes
   * for every image were never compared against anything the build checked.
   * For a record whose diagrams and PDFs carry the substance, "a projection
   * only publishes what was checked" stopped at the markdown.
   */
  it("records each asset's sha256, and its bytes move the build_id", () => {
    const root = repo();
    writeFileSync(path.join(root, "knowledge/policies/diagram.png"), PNG);
    expect(build(root, "--as-of", AS_OF).status).toBe(0);
    const first = lockOf(root);
    expect(first.assets.map((a) => a.path)).toEqual(["policies/diagram.png"]);

    writeFileSync(path.join(root, "knowledge/policies/diagram.png"), Buffer.concat([PNG, PNG]));
    expect(build(root, "--as-of", AS_OF).status).toBe(0);
    const second = lockOf(root);
    expect(second.assets[0]?.sha256).not.toBe(first.assets[0]?.sha256);
    expect(second.build_id).not.toBe(first.build_id);
  });
});

/**
 * The §8 indexes are the only file in `knowledge/` the BUILD writes, and they
 * are the surface an external reader parses to find anything at all. They were
 * in no section of the lock — not `documents` (the checker skips `index.md`),
 * not `companions` (the four attachment kinds), not `assets` (non-markdown) —
 * so the record of what was published stopped short of the file that lists
 * what was published.
 */
describe("ksor build — the generated indexes are inside what the lock checked", () => {
  it("records each index by the bytes it wrote, and an index edit moves build_id", () => {
    const root = repo();
    expect(build(root, "--as-of", AS_OF).status).toBe(0);
    const before = lockOf(root);
    expect(before.indexes.map((i) => i.path)).toEqual(["index.md", "policies/index.md"]);
    for (const index of before.indexes) {
      expect(index.sha256, `${index.path} in the lock does not hash the bytes on disk`).toBe(
        sha256Hex(readFileSync(path.join(root, "knowledge", index.path), "utf8")),
      );
    }

    // A title edit rewrites one bullet of one index and leaves the other alone.
    const welcome = path.join(root, "knowledge/welcome.md");
    writeFileSync(welcome, readFileSync(welcome, "utf8").replace("title: Welcome", "title: Start"));
    expect(build(root, "--as-of", AS_OF).status).toBe(0);
    const after = lockOf(root);
    expect(after.build_id).not.toBe(before.build_id);
    const moved = after.indexes.filter(
      (i) => i.sha256 !== before.indexes.find((b) => b.path === i.path)?.sha256,
    );
    expect(moved.map((i) => i.path)).toEqual(["index.md"]);
    expect(after.indexes[0]?.sha256).toBe(
      sha256Hex(readFileSync(path.join(root, "knowledge/index.md"), "utf8")),
    );
  });
});

describe("ksor build — a record-wide legal hold", () => {
  /**
   * A hold over the WHOLE record is refused, because only the website could
   * carry it out. `denies()` reads the empty prefix as "everything", so every
   * concept went unadmitted and the build exited 0 — while the serving side
   * walks `parent_id` from the node the denylist row names (decision 14) and
   * there is no node for the record root, so its seed is empty and the door
   * goes on serving every document. Walked on a live 187-document record:
   * `select count(*) from content_nodes where stable_id = 'knowledge/'` is 0.
   * The website going dark then reads as confirmation that a hold is in place
   * over a door that never stopped answering — decision 19's forbidden state,
   * inverted.
   *
   * This supersedes the earlier fix, which took the site half resolving the
   * root as proof the hold was recordable.
   */
  it("a subtree denial on the bundle root is refused, naming the per-section form", () => {
    const root = repo();
    writeFileSync(
      path.join(root, ".ksor/takedowns.yaml"),
      `${readFileSync(path.join(root, ".ksor/takedowns.yaml"), "utf8")}- id: 2026-08-25T09:00:00Z-eeeeee
  stable_id: knowledge/#section
  scope: subtree
  expected: present
  by: human:ciso
  at: 2026-08-25T09:00:00Z
  reason: legal hold over the whole record
`,
    );
    const r = build(root, "--as-of", AS_OF);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-takedown-dangling");
    expect(r.stderr).toContain("knowledge/#section");
    expect(r.stderr).toContain("--scope subtree knowledge/<section>");
    expect(r.stderr).toContain("--revoke 2026-08-25T09:00:00Z-eeeeee");
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

  /**
   * Editing a committed entry in place — same id, same actor, a different
   * target — republished the denied document and denied an innocent one, and
   * every gate stayed green because only the ID SET was compared. The baseline
   * now carries each entry's digest, so the edit is named on the field.
   */
  it("a committed entry RETARGETED in place is ksor-ledger-amended, naming the id, the field and the commit", () => {
    const root = repo();
    const ledger = path.join(root, ".ksor/takedowns.yaml");
    const sha = git(root, "rev-parse", "--short=7", "HEAD");
    writeFileSync(
      ledger,
      readFileSync(ledger, "utf8").replace("knowledge/policies/retired", "knowledge/policies/open"),
    );
    const r = build(root);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-ledger-amended");
    expect(r.stderr).toContain("2026-08-24T10:00:00Z-aaaaaa");
    expect(r.stderr).toContain("stable_id");
    expect(r.stderr).toContain(sha);
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(false);
  });

  it("the committed lock catches the same edit where there is no history to read", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ksor-norepo-amend-"));
    roots.push(root);
    for (const [rel, text] of Object.entries(VALID.files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    }
    expect(build(root, "--as-of", AS_OF).status).toBe(0);
    const ledger = path.join(root, ".ksor/takedowns.yaml");
    // A `reason` edit alone: nothing else about the record changes, so this is
    // the append-only rule and nothing else answering.
    writeFileSync(
      ledger,
      readFileSync(ledger, "utf8").replace("superseded figure", "a reason someone preferred"),
    );
    const r = build(root, "--as-of", AS_OF);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-ledger-amended");
    expect(r.stderr).toContain("build.lock.json");
    // The lock carries digests, not entries, so it names the id and not the
    // field — which is why the git-history baseline is the richer one.
    expect(r.stderr).toContain("2026-08-24T10:00:00Z-aaaaaa");
  });

  /**
   * The fifth of the verb's own refusals, and the only one nothing exercised —
   * the fixture-coverage rule deliberately skips the verb's slugs. A corrupt
   * committed lock is what a partial write or a version rollback leaves behind,
   * and the branch that handles it had never executed.
   */
  it("a lock it cannot parse is ksor-lock-invalid, and nothing is written", () => {
    for (const bad of ['{"format": 99}', "not json at all"]) {
      const root = repo();
      writeFileSync(path.join(root, "build.lock.json"), bad);
      const before = readFileSync(path.join(root, "knowledge/index.md"), "utf8");
      const r = build(root, "--as-of", AS_OF);
      expect(r.status, `${bad}: ${r.stderr}`).toBe(1);
      expect(r.stderr.split("\n")[0]).toBe("error: ksor-lock-invalid");
      expect(readFileSync(path.join(root, "build.lock.json"), "utf8")).toBe(bad);
      expect(readFileSync(path.join(root, "knowledge/index.md"), "utf8")).toBe(before);
    }
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
    // The entries deleted, not the FILE emptied: a ledger that exists and holds
    // nothing is `ksor-ledger-empty` — a torn write, refused before anything
    // parses — and this is about the baseline, so what is left has to be a
    // readable ledger the lock no longer matches.
    writeFileSync(path.join(root, ".ksor/takedowns.yaml"), "# the entries were deleted by hand\n");
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

/**
 * A build that publishes a snapshot has to say when the snapshot expires.
 *
 * `admitted` is decided at `as_of` and written into files; static output cannot
 * re-decide itself, so a document whose `stale_after` passes AFTER a build goes
 * on appearing in `llms.txt` and in its markdown twin while `ksor serve`, which
 * evaluates the same rule per request, already refuses it. The divergence is
 * specified (record spec §2.5); what was missing was any surface saying it. The
 * build reported a dropped admission only as a number that went down, the
 * emitted AGENTS.md stated the exclusion unconditionally, and no emitted
 * workflow rebuilds on a schedule (found 2026-08-25).
 *
 * A notice, and exit 0: a document past its review date is a governed state
 * with a page and a badge of its own, and a build that refused it would make
 * deleting the `stale_after` the fastest way to a green build.
 */
describe("ksor build says what its own snapshot will stop being true", () => {
  it("names the document it held back, and why, without refusing", () => {
    const r = build(repo(), "--as-of", AS_OF);
    expect(r.status).toBe(0);
    expect(r.stdout, r.stdout).toContain("policies/purchase-approval.md");
    expect(r.stdout, r.stdout).toContain("not effective until 2026-09-01T00:00:00.000Z");
    expect(r.stdout).not.toContain("problem:");
  });

  it("names the next instant at which this build's answer goes out of date", () => {
    const r = build(repo(), "--as-of", AS_OF);
    expect(r.status).toBe(0);
    // The EARLIEST future instant in the fixture: effective_from before stale_after.
    expect(r.stdout, r.stdout).toContain("at 2026-09-01T00:00:00.000Z");
    expect(r.stdout, r.stdout).toMatch(/cannot re-decide itself/);
  });

  it("reports a document already past its stale_after, and still exits 0", () => {
    const r = build(repo(), "--as-of", "2028-01-01T00:00:00Z");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout, r.stdout).toContain("past stale_after 2027-08-21T00:00:00.000Z");
  });
});
