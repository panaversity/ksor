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
import { parse as parseYaml } from "yaml";

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
    // …and SAYS why, in the words `ksor ingest` uses on the identical state.
    // Build used to report the same missing fact as a bare `(dirty)`, a word
    // no human-facing document defines, while ingest explained it in full
    // (first-hour walkthrough, 2026-08-26). Provenance is load-bearing, so the
    // verb that records it has to say when it could not.
    expect(r.stdout, r.stdout).toContain(
      "source: unspecified — knowledge/ is in a git repository with no commits yet",
    );
    expect(r.stdout).toContain("cannot be traced back to a reviewed commit");
    expect(r.stdout, "the remedy, not just the fault").toContain(
      "fix: commit the record (git add knowledge && git commit) and re-run",
    );
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
    // A clean build NAMES the commit it published, the way ingest names the
    // one it ingested. Silence about provenance reads the same whether it is
    // perfect or absent.
    expect(first.stdout, first.stdout).toContain(`source: ${lock.source_commit}`);
    expect(first.stdout, "nothing to explain when there is nothing missing").not.toContain(
      "unspecified",
    );
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
 * It has now regressed SIX times. This branch already removed "a third hand
 * copy of the attachment list that had already drifted", and two more were
 * still here afterwards — `build/index.ts`'s lock filter and `migrate/index.ts`'s
 * `COMPANION` — each carrying the SAME `.summary.mdx` gap the removed one had.
 *
 * Then this guard was scoped to `src/*.ts` minus tests, and a copy was sitting
 * in EACH of the two places that left out: the scaffold's `stage-knowledge.ts`
 * (whose comment still claimed byte-identity with a checker that had moved on)
 * and this package's `site-staging` fixture. The fixture one is the worse
 * shape — a test that classifies companions by its own rule cannot detect the
 * code under test classifying them differently. So the scan now covers the
 * emitted scaffold and test files too, and the WHOLE tree it is given rather
 * than one directory.
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
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      if (entry.isDirectory()) out.push(...sources(abs));
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(abs);
    }
    return out;
  };

  /**
   * The canonical list has to spell itself out, and this suite has to spell it
   * out to search for it. Nothing else may, INCLUDING tests and the emitted
   * scaffold — that is the scope that let copies five and six land.
   */
  const CANONICAL = ["lib/attachment-rule.ts", "src/build.integration.test.ts"];

  it("no module spells the suffix list out for itself", () => {
    const src = fileURLToPath(new URL(".", import.meta.url));
    const roots = [src, path.resolve(src, "..", "templates", "scaffold")];
    const offenders = roots
      .flatMap((root) => sources(root))
      .filter((file) => !CANONICAL.some((c) => file.replaceAll(path.sep, "/").endsWith(c)))
      .flatMap((file) =>
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
    // What the lock's `dirty: true` MEANS, said once, where the reader is.
    // The stamp used to be the word `(dirty)` appended to the summary line,
    // defined in no human-facing document (first-hour walkthrough, 2026-08-26).
    expect(loose.stdout, loose.stdout).toContain(`source: ${lockOf(root).source_commit} (dirty)`);
    expect(loose.stdout).toContain("does not contain the bytes this build published");
    expect(loose.stdout).toContain("fix: commit the inputs");
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
    // The state ingest distinguishes from "no commit yet", because the reader's
    // next command differs: here there is no repository to commit into.
    expect(r.stdout, r.stdout).toContain(
      "source: unspecified — knowledge/ is not in a git repository",
    );
    expect(r.stdout).toContain("fix: git init, commit the record, and re-run");
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

  it("a bad --as-of is refused before anything is read; --bundles is an ordinary build that also writes the bundles", () => {
    const root = repo();
    const bad = build(root, "--as-of", "yesterday");
    expect(bad.status).toBe(1);
    expect(bad.stderr.split("\n")[0]).toBe("error: bad-args");
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(false);
    const bundles = build(root, "--bundles", "--as-of", AS_OF);
    expect(bundles.status, bundles.stderr).toBe(0);
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(true);
    expect(existsSync(path.join(root, ".ksor/out/bundles/public/index.md"))).toBe(true);
  });

  it("--help describes the verb and performs nothing", () => {
    const root = repo();
    const r = build(root, "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--as-of");
    expect(r.stdout).toContain("--bundles");
    expect(r.stdout).toContain(".ksor/out/bundles/");
    expect(r.stdout).not.toContain("not implemented");
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(false);
  });
});

/**
 * Acceptance 6 (build spec §1 step 4, issue #158): one OKF bundle per
 * canonical viewer under `.ksor/out/bundles/<viewer>/`, holding exactly what
 * that viewer's machine surfaces publish. R5 applied to a directory someone
 * will send somewhere: the audience predicate has to hold across a filesystem
 * walk, so the public bundle is GREPPED for the internal concept rather than
 * inspected by name.
 */
describe("ksor build — acceptance 6: --bundles, one OKF bundle per viewer", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  /** Both concepts of `policies/` are admitted here: purchase approval is effective from 2026-09-01. */
  const LATER = "2026-09-02T12:00:00Z";
  const OUT = ".ksor/out/bundles";

  /**
   * The conformant record plus what the bundle rule has to move WITH a
   * concept: a companion and a referenced asset on the internal document, and
   * an asset nothing references.
   */
  function bundleRepo(): string {
    const root = repo();
    const boardPay = path.join(root, "knowledge/policies/board-pay.md");
    writeFileSync(
      boardPay,
      `${readFileSync(boardPay, "utf8")}\n![The board diagram](board-diagram.png)\n`,
    );
    writeFileSync(
      path.join(root, "knowledge/policies/board-pay.summary.md"),
      "---\ntype: Summary\n---\n\nBoard pay in short.\n",
    );
    writeFileSync(path.join(root, "knowledge/policies/board-diagram.png"), PNG);
    writeFileSync(path.join(root, "knowledge/policies/stray.png"), PNG);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "companion and assets");
    return root;
  }

  /** Every file under `dir`, bundle-relative, with the sha256 of its bytes. */
  function tree(dir: string): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (abs: string, rel: string): void => {
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(path.join(abs, entry.name), next);
        else out.set(next, sha256Hex(readFileSync(path.join(abs, entry.name))));
      }
    };
    walk(dir, "");
    return out;
  }

  /** Every byte of every file under `dir`, decoded byte-for-byte so nothing hides in a binary. */
  function everyByte(dir: string): string {
    return [...tree(dir).keys()]
      .map((rel) => readFileSync(path.join(dir, rel)).toString("latin1"))
      .join("\n");
  }

  /** The documented digest (build spec §2): sha256 over the JSON of the sorted (path, sha256) pairs. */
  function digestOf(files: Map<string, string>): string {
    return sha256Hex(JSON.stringify([...files].sort((a, b) => (a[0] < b[0] ? -1 : 1))));
  }

  it("the public bundle holds no byte of the internal concept; the internal bundle holds it with its companion and asset", () => {
    const root = bundleRepo();
    const r = build(root, "--bundles", "--as-of", LATER);
    expect(r.status, r.stderr).toBe(0);
    const pub = path.join(root, OUT, "public");
    const internal = path.join(root, OUT, "internal");
    expect([...tree(pub).keys()].sort()).toEqual([
      "index.md",
      "policies/index.md",
      "policies/purchase-approval.md",
    ]);
    expect([...tree(internal).keys()].sort()).toEqual([
      "index.md",
      "policies/board-diagram.png",
      "policies/board-pay.md",
      "policies/board-pay.summary.md",
      "policies/index.md",
      "policies/purchase-approval.md",
    ]);
    // R5 across a filesystem walk: not the title, not the path, not the
    // description, not the companion's prose.
    const leaked = everyByte(pub);
    for (const sentinel of ["Board pay", "board-pay", "Board pay in short", "board-diagram"]) {
      expect(leaked, `"${sentinel}" reached the public bundle`).not.toContain(sentinel);
    }
    expect(everyByte(internal)).toContain("Board pay in short");
    // Verbatim: frontmatter intact, every key preserved, the asset byte-equal.
    expect(readFileSync(path.join(internal, "policies/board-pay.md"))).toEqual(
      readFileSync(path.join(root, "knowledge/policies/board-pay.md")),
    );
    expect(readFileSync(path.join(internal, "policies/board-diagram.png"))).toEqual(PNG);
    // Nothing of the record beyond the bundle: no instance, no policy, no lock inside it.
    expect(existsSync(path.join(internal, "instance.md"))).toBe(false);
    expect(existsSync(path.join(internal, ".ksor"))).toBe(false);
    // What stdout says about each.
    expect(r.stdout, r.stdout).toContain(`wrote ${OUT}/public/`);
    expect(r.stdout).toContain(`wrote ${OUT}/internal/`);
    expect(r.stdout).toContain("[public, internal]");
  });

  it("a directory with nothing admitted has no index and no bullet, and a link to an excluded concept is named", () => {
    const root = bundleRepo();
    // At AS_OF nothing in policies/ is admitted for public: board pay is
    // internal, purchase approval is not yet effective, old threshold is
    // deprecated. The public bundle is the root index alone.
    const r = build(root, "--bundles", "--as-of", AS_OF);
    expect(r.status, r.stderr).toBe(0);
    const pub = path.join(root, OUT, "public");
    expect([...tree(pub).keys()]).toEqual(["index.md"]);
    // The trailing blank line is the generator's shape for a childless
    // directory — the same bytes `ksor build` would commit for an empty record.
    expect(readFileSync(path.join(pub, "index.md"), "utf8")).toBe(
      '---\nokf_version: "0.2"\n---\n\n# Acme\n\n',
    );
    const internal = path.join(root, OUT, "internal");
    expect([...tree(internal).keys()].sort()).toEqual([
      "index.md",
      "policies/board-diagram.png",
      "policies/board-pay.md",
      "policies/board-pay.summary.md",
      "policies/index.md",
    ]);
    expect(readFileSync(path.join(internal, "policies/index.md"), "utf8")).toBe(
      "# Policies\n\n* [Board pay](board-pay.md) - Board pay, in one sentence.\n",
    );
    // Board pay links purchase approval, which this bundle excludes: the body
    // is copied verbatim, so the link dangles, and the build says so rather
    // than rewriting a document or refusing a governed state.
    expect(r.stdout, r.stdout).toContain(
      "policies/board-pay.md links to policies/purchase-approval.md",
    );
    expect(r.stdout).toContain("excludes");
  });

  it("a denied concept is in no bundle, and a revoked denial restores it", () => {
    const root = bundleRepo();
    const ledger = path.join(root, ".ksor/takedowns.yaml");
    writeFileSync(
      ledger,
      `${readFileSync(ledger, "utf8")}- id: 2026-08-25T10:00:00Z-cccccc
  stable_id: knowledge/policies/board-pay
  scope: node
  expected: present
  by: human:ciso
  at: 2026-08-25T10:00:00Z
`,
    );
    const denied = build(root, "--bundles", "--as-of", LATER);
    expect(denied.status, denied.stderr).toBe(0);
    for (const viewer of ["public", "internal"]) {
      const bytes = everyByte(path.join(root, OUT, viewer));
      expect(bytes, `board pay reached the ${viewer} bundle while denied`).not.toContain(
        "Board pay",
      );
      expect(bytes).not.toContain("board-diagram");
    }
    writeFileSync(
      ledger,
      `${readFileSync(ledger, "utf8")}- id: 2026-08-25T11:00:00Z-dddddd
  revokes: 2026-08-25T10:00:00Z-cccccc
  by: human:ciso
  at: 2026-08-25T11:00:00Z
`,
    );
    const restored = build(root, "--bundles", "--as-of", LATER);
    expect(restored.status, restored.stderr).toBe(0);
    expect(tree(path.join(root, OUT, "internal")).has("policies/board-pay.md")).toBe(true);
    expect(tree(path.join(root, OUT, "public")).has("policies/board-pay.md")).toBe(false);
  });

  /**
   * Two readers, neither of which is the writer. The BARE one is yaml plus the
   * §8 grammar and nothing of ksor — the consumer the claim is made to. The
   * KERNEL one hands the bundle back to `checkRecord` as if it were a record's
   * own `knowledge/`: every index has to be exactly what the filtered tree
   * generates, every link has to resolve inside the bundle, and every companion
   * has to have its parent beside it.
   */
  it("reads back as a conformant OKF bundle with no ksor in the loop, and as a record by the kernel's own checker", () => {
    const root = bundleRepo();
    expect(build(root, "--bundles", "--as-of", LATER).status).toBe(0);
    for (const viewer of ["public", "internal"]) {
      const dir = path.join(root, OUT, viewer);
      const files = tree(dir);
      const isFile = (rel: string): boolean => files.has(rel);
      const isDir = (rel: string): boolean =>
        [...files.keys()].some((f) => f.startsWith(`${rel}/`));
      for (const rel of files.keys()) {
        if (!rel.endsWith(".md")) continue;
        const raw = readFileSync(path.join(dir, rel), "utf8");
        const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
        if (path.basename(rel) === "index.md") {
          // OKF §8: no frontmatter, except okf_version at the bundle root.
          if (rel === "index.md") {
            expect(fm, `${viewer}/${rel} has no frontmatter block`).not.toBeNull();
            expect(parseYaml(fm![1]!)).toEqual({ okf_version: "0.2" });
          } else {
            expect(fm, `${viewer}/${rel} carries frontmatter`).toBeNull();
          }
          const body = fm === null ? raw : raw.slice(fm[0].length);
          const bullets = body.split("\n").filter((l) => l.startsWith("* "));
          expect(bullets.length, `${viewer}/${rel} lists nothing`).toBeGreaterThan(0);
          for (const line of bullets) {
            const m = /^\* \[[^\]]+\]\(([^)]+)\)(?: - .+)?$/.exec(line);
            expect(m, `${viewer}/${rel}: "${line}" is not a §8 bullet`).not.toBeNull();
            const href = m![1]!;
            const target = path.posix.join(path.posix.dirname(rel), href);
            expect(
              href.endsWith("/") ? isDir(target.replace(/\/$/, "")) : isFile(target),
              `${viewer}/${rel} lists ${href}, which the bundle does not hold`,
            ).toBe(true);
          }
          continue;
        }
        // OKF §11: every non-reserved .md has parseable frontmatter with a non-empty type.
        expect(fm, `${viewer}/${rel} has no frontmatter`).not.toBeNull();
        const parsed = parseYaml(fm![1]!) as Record<string, unknown>;
        expect(typeof parsed["type"] === "string" && parsed["type"].length > 0).toBe(true);
      }

      // The kernel's reader: the bundle IS a record's knowledge/ — with the
      // record's own instance and policy beside it and no ledger, because a
      // denied concept is absent by design and a ledger naming it would refuse.
      const asRecord = new Map<string, string>([
        ["instance.md", readFileSync(path.join(root, "instance.md"), "utf8")],
        [".ksor/governance.yaml", readFileSync(path.join(root, ".ksor/governance.yaml"), "utf8")],
      ]);
      const assets = new Map<string, Uint8Array>();
      const dirs = new Set<string>();
      for (const rel of files.keys()) {
        const abs = path.join(dir, rel);
        if (/\.(md|yaml)$/.test(rel)) asRecord.set(`knowledge/${rel}`, readFileSync(abs, "utf8"));
        else assets.set(`knowledge/${rel}`, new Uint8Array(readFileSync(abs)));
        for (let d = path.posix.dirname(rel); d !== "."; d = path.posix.dirname(d)) {
          dirs.add(`knowledge/${d}`);
        }
      }
      const checked = checkRecord(
        { files: asRecord, dirs: [...dirs], assets },
        { mode: "check", ledgerBaselines: [] },
      );
      expect(
        checked.refusals.map((x) => `${x.slug} ${x.path}: ${x.why}`),
        `the ${viewer} bundle, read as a record`,
      ).toEqual([]);
    }
  });

  it("two runs are byte-identical, a previous run's strays are pruned, and the lock records every bundle's digest whether or not it was written", () => {
    const root = bundleRepo();
    expect(build(root, "--bundles", "--as-of", LATER).status).toBe(0);
    const first = {
      public: tree(path.join(root, OUT, "public")),
      internal: tree(path.join(root, OUT, "internal")),
    };
    const lockBytes = readFileSync(path.join(root, "build.lock.json"), "utf8");
    // Provenance travels beside the bundles the way it sits beside knowledge/.
    expect(readFileSync(path.join(root, OUT, "build.lock.json"), "utf8")).toBe(lockBytes);

    // What an earlier, wider build might have left behind: a file in a bundle,
    // and a whole bundle for an audience the policy no longer registers.
    writeFileSync(path.join(root, OUT, "public/leak.md"), "---\ntype: Document\n---\n");
    mkdirSync(path.join(root, OUT, "board"), { recursive: true });
    writeFileSync(path.join(root, OUT, "board/index.md"), "# board\n");
    expect(build(root, "--bundles", "--as-of", LATER).status).toBe(0);
    expect(tree(path.join(root, OUT, "public"))).toEqual(first.public);
    expect(tree(path.join(root, OUT, "internal"))).toEqual(first.internal);
    expect(existsSync(path.join(root, OUT, "board"))).toBe(false);
    expect(readdirSync(path.join(root, OUT)).sort()).toEqual([
      "build.lock.json",
      "internal",
      "public",
    ]);
    expect(readFileSync(path.join(root, "build.lock.json"), "utf8")).toBe(lockBytes);

    const lock = lockOf(root);
    expect(lock.bundles).toEqual([
      { viewer: "public", sha256: digestOf(first.public), files: first.public.size },
      { viewer: "internal", sha256: digestOf(first.internal), files: first.internal.size },
    ]);
    // A plain build records the same digests: the bundle set is a function of
    // what the lock already hashes, so the lock does not depend on the flag.
    rmSync(path.join(root, ".ksor/out"), { recursive: true, force: true });
    expect(build(root, "--as-of", LATER).status).toBe(0);
    expect(readFileSync(path.join(root, "build.lock.json"), "utf8")).toBe(lockBytes);
    expect(existsSync(path.join(root, ".ksor/out"))).toBe(false);
  });

  /** `bundleRepo()` with one more audience registered in `.ksor/governance.yaml`. */
  function repoRegistering(...ids: readonly string[]): string {
    const root = bundleRepo();
    const policy = path.join(root, ".ksor/governance.yaml");
    writeFileSync(
      policy,
      readFileSync(policy, "utf8").replace(
        "audiences:\n",
        `audiences:\n${ids.map((id) => `  ${JSON.stringify(id)}:\n    description: Added by the test\n`).join("")}`,
      ),
    );
    return root;
  }

  it("a refusal writes no bundle, and an audience identifier that is not a path segment is refused before anything is written — on EVERY build, flag or not", () => {
    const refused = bundleRepo();
    writeFileSync(path.join(refused, "knowledge/bad.md"), "---\ntitle: only\n---\n");
    const r = build(refused, "--bundles", "--as-of", LATER);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-audience-missing");
    expect(existsSync(path.join(refused, ".ksor/out"))).toBe(false);

    const hostile = repoRegistering("../escape");
    const bundles = build(hostile, "--bundles", "--as-of", LATER);
    expect(bundles.status).toBe(1);
    expect(bundles.stderr.split("\n")[0]).toBe("error: ksor-audience-identifier-invalid");
    expect(bundles.stderr).toContain("../escape");
    expect(bundles.stderr).toContain("fix:");
    expect(existsSync(path.join(hostile, ".ksor/out"))).toBe(false);
    expect(existsSync(path.join(hostile, ".ksor/escape"))).toBe(false);

    // A PLAIN build refuses the same identifier. The lock records `bundles[]`
    // on every build, so letting this through would commit a digest for a
    // directory `--bundles` refuses to write — provenance for a thing that
    // cannot exist. The owner learns about it at the build they already run.
    const plain = build(hostile, "--as-of", LATER);
    expect(plain.status).toBe(1);
    expect(plain.stderr.split("\n")[0]).toBe("error: ksor-audience-identifier-invalid");
    expect(plain.stderr).toContain("../escape");

    // A plain path segment, and still refused: the lock copy sits beside the
    // bundle directories, so an audience by its name would collide with it —
    // found by asking what the one reserved sibling name does (hostile pass).
    // Casefolded, for the same reason the collision rule is casefolded: on a
    // case-insensitive filesystem `Build.Lock.json` IS the lock's name.
    for (const id of ["build.lock.json", "Build.Lock.json"]) {
      const reserved = repoRegistering(id);
      const collide = build(reserved, "--bundles", "--as-of", LATER);
      expect(collide.status, `${id} was accepted: ${collide.stdout}`).toBe(1);
      expect(collide.stderr.split("\n")[0]).toBe("error: ksor-audience-identifier-invalid");
      expect(collide.stderr).toContain("collide");
      expect(existsSync(path.join(reserved, ".ksor/out"))).toBe(false);
    }

    // The prose the refusal prints is the regex, not a wider set: a leading
    // `.` or `-` is refused, so `.hidden` cannot become a dotfile directory
    // and `-x` cannot become something a shell reads as a flag.
    for (const id of [".hidden", "-x"]) {
      const dotted = build(repoRegistering(id), "--bundles", "--as-of", LATER);
      expect(dotted.status, `${id} was accepted: ${dotted.stdout}`).toBe(1);
      expect(dotted.stderr.split("\n")[0]).toBe("error: ksor-audience-identifier-invalid");
      expect(dotted.stderr).toContain(id);
    }
  });

  it("two registered audiences that differ only in case are refused: they are two viewers and one directory", () => {
    // `internal` is already registered; `Internal` passes the policy and the
    // path-segment check, then merges into the SAME directory on macOS and
    // Windows — the surviving bundle holding the internal-only concept while
    // the lock's digest for that viewer describes a directory that is not
    // there. Refused where the bundle set is computed, on every platform.
    const root = repoRegistering("Internal");
    const bundles = build(root, "--bundles", "--as-of", LATER);
    expect(bundles.status, bundles.stdout).toBe(1);
    expect(bundles.stderr.split("\n")[0]).toBe("error: ksor-audience-identifier-collides");
    expect(bundles.stderr).toContain('"Internal"');
    expect(bundles.stderr).toContain('"internal"');
    expect(bundles.stderr).toContain("fix:");
    expect(existsSync(path.join(root, ".ksor/out"))).toBe(false);

    // The same refusal without the flag, for the reason the lock records
    // `bundles[]` without it.
    const plain = build(root, "--as-of", LATER);
    expect(plain.status, plain.stdout).toBe(1);
    expect(plain.stderr.split("\n")[0]).toBe("error: ksor-audience-identifier-collides");

    // `public` is reserved by name; casefolded it is reserved too, or the
    // registered audience would swallow the public bundle.
    const shadow = build(repoRegistering("Public"), "--bundles", "--as-of", LATER);
    expect(shadow.status, shadow.stdout).toBe(1);
    expect(shadow.stderr.split("\n")[0]).toBe("error: ksor-audience-identifier-collides");
    expect(shadow.stderr).toContain('"Public"');
  });

  it("the emitted starter bundles its five documents for public, and git ignores the output", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ksor-starter-bundles-"));
    roots.push(dir);
    const init = spawnSync(process.execPath, [distCli, "init", "my-sor"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(init.status, init.stderr).toBe(0);
    const root = path.join(dir, "my-sor");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    git(root, "config", "commit.gpgsign", "false");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "first");
    const r = build(root, "--bundles", "--as-of", AS_OF);
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(path.join(root, OUT)).sort()).toEqual(["build.lock.json", "public"]);
    expect([...tree(path.join(root, OUT, "public")).keys()].sort()).toEqual([
      "governance-ladder.md",
      "index.md",
      "surfaces/for-agents.md",
      "surfaces/for-people.md",
      "surfaces/index.md",
      "surfaces/overview.md",
      "what-is-a-ksor.md",
      // The starter's one companion, beside its parent — a companion travels
      // by position (decision 24), so it is in the bundle its parent is in.
      "what-is-a-ksor.summary.md",
    ]);
    expect(git(root, "status", "--porcelain", "--", ".ksor")).toBe("");
    const ignored = spawnSync("git", ["check-ignore", "-q", ".ksor/out/bundles/public/index.md"], {
      cwd: root,
    });
    expect(ignored.status, ".ksor/out/ is not gitignored in the scaffold").toBe(0);
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
