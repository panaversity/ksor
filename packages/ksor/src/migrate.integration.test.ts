/**
 * `ksor migrate` (research/okf-native.md §1.8; record spec §7 acceptance 5):
 * driven through the built CLI against the pre-profile shapes it exists to
 * convert — the frozen starter, a ranked-audience record, and the repository's
 * own fixture corpus.
 *
 * The starter is asserted WITHOUT `--approve-by` (every `approved` document
 * becomes a draft) and the workbench fixture WITH it (its supersession pointer
 * needs a `stable` successor), so both halves of the acceptance are walked.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
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

import {
  checkRecord,
  loadRecord,
  parseInstant,
  splitFrontmatter,
} from "@panaversity/ksor-content/record";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRE_PROFILE_STARTER } from "./__fixtures__/pre-profile-starter.js";

/**
 * The fixture is the TEMPLATE; `ksor init` stamps it before it reaches an
 * adopter, and migrate reads what the adopter has. `KSOR-STAMP-NAME` is not a
 * legal instance `name` (it is uppercase), so a migration run against an
 * unstamped template would only ever prove that migrate refuses it.
 */
const STARTER: readonly (readonly [string, string])[] = PRE_PROFILE_STARTER.map(
  ([rel, text]) =>
    [
      rel,
      text.replaceAll("KSOR-STAMP-NAME", "acme").replaceAll("KSOR-STAMP-VERSION", "0.0.30"),
    ] as const,
);

const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function write(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

/** A record of `files`, in a repository with one commit (so `generated.at` derives). */
function repo(files: readonly (readonly [string, string])[], commit = true): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-migrate-"));
  roots.push(root);
  for (const [rel, text] of files) write(root, rel, text);
  if (!commit) return root;
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
function run(root: string, verb: string, ...args: string[]): Run {
  const r = spawnSync(process.execPath, [distCli, verb, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KSOR_DRAFTS: undefined },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const read = (root: string, rel: string): string => readFileSync(path.join(root, rel), "utf8");
const fm = (root: string, rel: string): Record<string, unknown> => {
  const split = splitFrontmatter(read(root, rel), rel);
  if (!split.ok) throw new Error(`${rel}: ${split.refusal.why}`);
  return { ...split.frontmatter };
};
const body = (root: string, rel: string): string => {
  const split = splitFrontmatter(read(root, rel), rel);
  if (!split.ok) throw new Error(`${rel}: ${split.refusal.why}`);
  return split.body;
};
/** Every file under the record, so "nothing was written" is a file-set claim too. */
function tree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.set(path.relative(root, p).split(path.sep).join("/"), readFileSync(p, "utf8"));
    }
  };
  walk(root);
  return out;
}
const refusalsOf = (root: string): readonly string[] =>
  checkRecord(loadRecord(root), { mode: "build" }).refusals.map((r) => `${r.path}: ${r.slug}`);

const ACTOR = "human:kim";

beforeAll(() => {
  expect(existsSync(distCli), `${distCli} is missing — run pnpm build first`).toBe(true);
});

describe("ksor migrate — the contract", () => {
  it("--help prints the contract and performs nothing", () => {
    const root = repo(STARTER);
    const before = tree(root);
    const r = run(root, "migrate", "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--write");
    expect(r.stdout).toContain("--approve-by");
    expect(tree(root)).toEqual(before);
  });

  it("refuses an unknown flag with bad-args and writes nothing", () => {
    const root = repo(STARTER);
    const before = tree(root);
    const r = run(root, "migrate", "--wrote");
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: bad-args");
    expect(tree(root)).toEqual(before);
  });

  it("refuses outside a record with ksor-instance-missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ksor-migrate-empty-"));
    roots.push(root);
    const r = run(root, "migrate");
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-instance-missing");
  });

  it("without --write prints a unified diff and leaves the tree byte-identical", () => {
    const root = repo(STARTER);
    const before = tree(root);
    const r = run(root, "migrate", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("--- a/instance.md");
    expect(r.stdout).toContain("+++ b/instance.md");
    expect(r.stdout).toContain("+++ b/.ksor/governance.yaml");
    expect(r.stdout).toContain("+++ b/knowledge/surfaces/overview.md");
    expect(r.stdout).toContain("--- a/knowledge/surfaces/index.md");
    expect(r.stdout).toMatch(/^\+type: Document$/m);
    expect(tree(root)).toEqual(before);
  });
});

describe("ksor migrate --write on the pre-profile starter (no --approve-by)", () => {
  let root = "";
  beforeAll(() => {
    root = repo(STARTER);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
  });

  it("produces a tree the record checker accepts", () => {
    expect(refusalsOf(root)).toEqual([]);
  });

  it("`ksor build` then succeeds and writes the lock", () => {
    const r = run(root, "build");
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(root, "build.lock.json"))).toBe(true);
  });

  it("rewrites the instance: format 2, title from the H1, description derived, toolchain moved", () => {
    const instance = fm(root, "instance.md");
    expect(instance["format"]).toBe(2);
    expect(instance["name"]).toBe("acme");
    expect(instance["title"]).toBe("KSoR");
    expect(instance["description"]).toBe(
      "This record is authoritative for what a Knowledge System of Record is, how a project climbs the governance ladder, and which surfaces the same governed knowledge is published through.",
    );
    expect(instance["toolchain"]).toEqual({
      requires: ">=0.0.30",
      scaffolded: "0.0.30",
    });
    expect(instance["ksor"]).toBeUndefined();
    // The H1 is now `title:`; the body is the MCP instructions and carries none.
    expect(body(root, "instance.md")).not.toMatch(/^# /m);
  });

  it("writes a level-0 governance policy naming the migrating actor", () => {
    const policy = read(root, ".ksor/governance.yaml");
    expect(policy).toContain('version: "0.1"');
    expect(policy).toContain(ACTOR);
    expect(existsSync(path.join(root, ".ksor/takedowns.yaml"))).toBe(false);
  });

  it("maps every concept key: type, audience, owner, sources, effective_from, generated", () => {
    const doc = fm(root, "knowledge/what-is-a-ksor.md");
    expect(doc["type"]).toBe("Document");
    expect(doc["status"]).toBe("draft");
    expect(doc["order"]).toBe(1);
    expect(doc["ksor"]).toEqual({
      audience: ["public"],
      owner: "Product",
      effective_from: "2026-08-22T00:00:00Z",
    });
    expect(doc["sources"]).toEqual([
      {
        id: "ksor-readme-what-is-a-knowledge-system-of-record",
        title: 'KSoR README, "What Is a Knowledge System of Record?"',
        resource: 'KSoR README, "What Is a Knowledge System of Record?"',
      },
    ]);
    const generated = doc["generated"] as { by: string; at: string };
    expect(generated.by).toMatch(/^ksor-migrate\/\d+\.\d+\.\d+/);
    expect(parseInstant(generated.at)).not.toBeNull();
    // The last commit touching the file, not HEAD-of-now.
    expect(generated.at).toBe(
      git(root, "log", "-1", "--format=%cI", "--", "knowledge/what-is-a-ksor.md"),
    );
    for (const key of ["visibility", "provenance", "owner", "effective", "superseded"]) {
      expect(doc[key], key).toBeUndefined();
    }
  });

  // `ksor build` has already run above, so surfaces/index.md is a GENERATED
  // index here — which is the point: migrate empties the reserved name and the
  // build fills it back in with the record's own map.
  it("moves a reserved index carrying prose into overview.md", () => {
    expect(existsSync(path.join(root, "knowledge/surfaces/overview.md"))).toBe(true);
    expect(fm(root, "knowledge/surfaces/overview.md")["title"]).toBe("Surfaces");
    expect(body(root, "knowledge/surfaces/overview.md")).toContain("Why they cannot drift");
    // `ksor build` regenerates surfaces/index.md, and it is a generated index now.
    expect(read(root, "knowledge/surfaces/index.md")).toMatch(/^# Surfaces\n\n\* \[/);
  });

  it("marks the summary companion and leaves the other companions alone", () => {
    expect(fm(root, "knowledge/what-is-a-ksor.summary.md")).toEqual({ type: "Summary" });
    // A flashcards deck is invisible to OKF and to migrate alike: byte-identical.
    expect(read(root, "knowledge/what-is-a-ksor.flashcards.yaml")).toBe(
      STARTER.find(([p]) => p.endsWith(".flashcards.yaml"))![1],
    );
  });

  it("is idempotent — a second run has nothing to say", () => {
    const before = tree(root);
    const r = run(root, "migrate", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("nothing to migrate");
    expect(tree(root)).toEqual(before);
  });
});

describe("ksor migrate --approve-by", () => {
  it("makes every previously-approved document stable with that approval, and leaves drafts drafts", () => {
    const root = repo(STARTER);
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", "human:cfo");
    expect(r.status, r.stderr).toBe(0);
    const approved = fm(root, "knowledge/what-is-a-ksor.md");
    expect(approved["status"]).toBe("stable");
    const approval = (approved["ksor"] as Record<string, unknown>)["approval"] as {
      by: string;
      at: string;
    };
    expect(approval.by).toBe("human:cfo");
    const generated = approved["generated"] as { at: string };
    expect(parseInstant(generated.at)!).toBeLessThanOrEqual(parseInstant(approval.at)!);
    expect(fm(root, "knowledge/governance-ladder.md")["status"]).toBe("draft");
    expect(refusalsOf(root)).toEqual([]);
  });
});

describe("ksor migrate — the ranked audience model expands upward", () => {
  const INSTANCE = [
    "instance.md",
    [
      "---",
      "format: 1",
      "name: acme",
      "audiences: [public, internal, board]",
      "default_visibility: internal",
      "---",
      "",
      "# Acme",
      "",
      "Acme's governed knowledge. It covers nothing else.",
      "",
    ].join("\n"),
  ] as const;
  const doc = (name: string, keys: string): readonly [string, string] =>
    [
      `knowledge/${name}.md`,
      `---\ntitle: ${name}\ndescription: About ${name}.\nstatus: draft\n${keys}---\n\nBody.\n`,
    ] as const;

  it("expands a tier to every tier at or above it, and defaults an absent one", () => {
    const root = repo([
      INSTANCE,
      doc("mid", "visibility: internal\n"),
      doc("open", "visibility: public\n"),
      doc("bare", ""),
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    const audience = (rel: string): unknown =>
      (fm(root, rel)["ksor"] as Record<string, unknown>)["audience"];
    expect(audience("knowledge/mid.md")).toEqual(["internal", "board"]);
    expect(audience("knowledge/open.md")).toEqual(["public", "internal", "board"]);
    expect(audience("knowledge/bare.md")).toEqual(["internal", "board"]);
    const policy = read(root, ".ksor/governance.yaml");
    expect(policy).toContain("internal:");
    expect(policy).toContain("board:");
    expect(policy).not.toContain("public:");
    expect(refusalsOf(root)).toEqual([]);
  });

  it("defaults to [public] when the record declares no model", () => {
    const root = repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      doc("bare", ""),
    ]);
    expect(run(root, "migrate", "--write", "--actor", ACTOR).status).toBe(0);
    expect((fm(root, "knowledge/bare.md")["ksor"] as Record<string, unknown>)["audience"]).toEqual([
      "public",
    ]);
  });
});

describe("ksor migrate — lifecycle mappings", () => {
  const instance = [
    "instance.md",
    "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n",
  ] as const;

  it("review becomes draft", () => {
    const root = repo([
      instance,
      ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: review\n---\n\nBody.\n"],
    ]);
    expect(run(root, "migrate", "--write", "--actor", ACTOR).status).toBe(0);
    expect(fm(root, "knowledge/a.md")["status"]).toBe("draft");
  });

  it("superseded becomes deprecated with a resolved pointer and an attributed deprecation", () => {
    const root = repo([
      instance,
      [
        "knowledge/new.md",
        "---\ntitle: New\ndescription: The current one.\nstatus: approved\n---\n\nBody.\n",
      ],
      [
        "knowledge/old.md",
        "---\ntitle: Old\ndescription: The former one.\nstatus: superseded\nsuperseded_by: ./new.md\n---\n\nBody.\n",
      ],
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", "human:cfo");
    expect(r.status, r.stderr).toBe(0);
    const old = fm(root, "knowledge/old.md");
    expect(old["status"]).toBe("deprecated");
    const ksor = old["ksor"] as Record<string, unknown>;
    expect(ksor["superseded_by"]).toBe("new");
    expect((ksor["deprecated"] as { by: string }).by).toBe(ACTOR);
    expect(old["superseded_by"]).toBeUndefined();
    expect(refusalsOf(root)).toEqual([]);
  });
});

describe("ksor migrate — what it refuses to invent", () => {
  const instance = [
    "instance.md",
    "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n",
  ] as const;

  it("refuses a document with no description by name, and writes nothing", () => {
    const root = repo([
      instance,
      ["knowledge/a.md", "---\ntitle: A\nstatus: draft\n---\n\nBody.\n"],
    ]);
    const before = tree(root);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-migrate-underivable");
    expect(r.stderr).toContain("knowledge/a.md");
    expect(r.stderr).toContain("description");
    expect(tree(root)).toEqual(before);
  });

  it("refuses a document whose title it cannot derive", () => {
    const root = repo([
      instance,
      ["knowledge/a.md", "---\nstatus: draft\ndescription: A doc.\n---\n\nBody with no heading.\n"],
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-migrate-underivable");
    expect(r.stderr).toContain("title");
  });

  it("derives a missing title from the body's H1", () => {
    const root = repo([
      instance,
      [
        "knowledge/a.md",
        "---\nstatus: draft\ndescription: A doc.\n---\n\n# The heading\n\nBody.\n",
      ],
    ]);
    expect(run(root, "migrate", "--write", "--actor", ACTOR).status).toBe(0);
    expect(fm(root, "knowledge/a.md")["title"]).toBe("The heading");
  });

  it("refuses `generated.at` outside a repository, and accepts --generated-at there", () => {
    const files = [
      instance,
      ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n"],
    ] as const;
    const bare = repo(files, false);
    const r = run(bare, "migrate", "--write", "--actor", ACTOR);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-migrate-underivable");
    expect(r.stderr).toContain("--generated-at");

    const other = repo(files, false);
    const ok = run(
      other,
      "migrate",
      "--write",
      "--actor",
      ACTOR,
      "--generated-at",
      "2026-01-01T00:00:00Z",
    );
    expect(ok.status, ok.stderr).toBe(0);
    expect((fm(other, "knowledge/a.md")["generated"] as { at: string }).at).toBe(
      "2026-01-01T00:00:00Z",
    );
  });

  it("refuses without --actor when it would have to mint a policy", () => {
    const root = repo([
      instance,
      ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n"],
    ]);
    const r = run(root, "migrate", "--write");
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: bad-args");
    expect(r.stderr).toContain("--actor");
  });

  /**
   * The two files this migration writes into `.ksor/` ARE the record, and
   * every scaffold ever emitted ignores that directory wholesale — so
   * `git add -A` staged neither, the migration committed green locally, and
   * the clone CI built from refused `ksor-policy-missing`. A directory
   * pattern cannot be negated, so the bare line is replaced.
   */
  it("un-ignores the policy and the ledger, and `ksor build` refuses while they are ignored", () => {
    const files = [
      instance,
      ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n"],
      [
        ".gitignore",
        "# scratch space for ksor verbs — everything transient lives under one roof\n.ksor/\n\nnode_modules/\n",
      ],
    ] as const;
    const root = repo(files);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    const after = read(root, ".gitignore");
    expect(after).toContain(".ksor/*");
    expect(after).toContain("!.ksor/governance.yaml");
    expect(after).toContain("!.ksor/takedowns.yaml");
    expect(after).not.toContain("everything transient lives under one roof");
    expect(after).toContain("node_modules/");
    // The file is really tracked now — the claim is git's, not the text's.
    expect(
      spawnSync("git", ["check-ignore", "--", ".ksor/governance.yaml"], { cwd: root }).status,
    ).toBe(1);
    expect(run(root, "build").status).toBe(0);

    // And a record whose .gitignore was left alone is refused BY NAME rather
    // than building green here and failing in a clone. The refusal is about a
    // file that IS there: an ignored path a record does not have is not its
    // problem, so a level-0 record that never wanted a ledger still builds.
    const stale = repo(files);
    write(stale, ".ksor/governance.yaml", read(root, ".ksor/governance.yaml"));
    const refused = run(stale, "build");
    expect(refused.stderr.split("\n")[0]).toBe("error: ksor-governance-ignored");
    expect(refused.stderr).toContain(".gitignore");
    expect(refused.stderr).not.toContain("takedowns.yaml —");
  });

  /**
   * The published runbook is `ksor migrate --write --actor human:<you>` then
   * `ksor build`, and on the commonest pre-profile shape — a withdrawn
   * document pointing at the approved one that replaced it — it ended RED:
   * `approved` becomes `draft` without `--approve-by`, and the checker then
   * strands the pointer. Migrate refuses that up front now, naming the flag.
   */
  it("refuses to demote a successor another document points at", () => {
    const files = [
      instance,
      [
        "knowledge/new.md",
        "---\ntitle: New\ndescription: The current policy.\nstatus: approved\n---\n\nBody.\n",
      ],
      [
        "knowledge/old.md",
        "---\ntitle: Old\ndescription: The 2019 policy.\nstatus: superseded\nsuperseded_by: ./new.md\n---\n\nBody.\n",
      ],
    ] as const;
    const root = repo(files);
    const before = tree(root);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-migrate-underivable");
    expect(r.stderr).toContain("--approve-by");
    expect(r.stderr).toContain("knowledge/old.md");
    expect(tree(root)).toEqual(before);

    // The same tree WITH the flag migrates and then builds green — the whole
    // point of naming it in the refusal.
    const other = repo(files);
    const ok = run(other, "migrate", "--write", "--actor", ACTOR, "--approve-by", ACTOR);
    expect(ok.status, ok.stderr).toBe(0);
    const built = run(other, "build");
    expect(built.status, built.stderr).toBe(0);
  });

  /**
   * The FIRST line of the published upgrade path is bare `ksor migrate` —
   * "prints the diff, writes nothing". It exited 1 on every pre-profile
   * record, because a pre-profile record by definition has no policy and the
   * `--actor` precondition never consulted `--write`. A dry run needs an actor
   * to APPLY the migration, not to SHOW it.
   */
  it("shows the diff without --actor, naming the placeholder it would replace", () => {
    const root = repo([
      instance,
      [
        "knowledge/a.md",
        "---\ntitle: A\ndescription: A doc.\nstatus: superseded\nsuperseded_by: ./b.md\n---\n\nBody.\n",
      ],
      ["knowledge/b.md", "---\ntitle: B\ndescription: B doc.\nstatus: draft\n---\n\nBody.\n"],
    ]);
    const before = tree(root);
    const r = run(root, "migrate");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("+++ b/.ksor/governance.yaml");
    // The placeholder is visible in the diff, not silently filled in, and the
    // closing line says what to re-run with.
    expect(r.stdout).toContain("human:<you>");
    expect(r.stdout).toContain("--actor human:<id>");
    expect(tree(root)).toEqual(before);
  });

  /**
   * The three LEGACY_KEYS migrate never handled. `sor_id` is refused because
   * dropping it changes the document's stable_id from the sor_id value to its
   * path, which silently breaks every denylist row and citation keyed on the
   * old one; `id`/`name` are deleted. Leaving them produced a tree the checker
   * refuses AND an infinite fix-loop, because `hasProfileShape` stays false
   * while any legacy key is present and each pass re-minted `ksor.approval.at`
   * — a governance instant moving on every run.
   */
  it("refuses sor_id by name and writes nothing", () => {
    const root = repo([
      instance,
      [
        "knowledge/a.md",
        "---\ntitle: A\ndescription: A doc.\nstatus: draft\nsor_id: legacy-a\n---\n\nBody.\n",
      ],
    ]);
    const before = tree(root);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-migrate-underivable");
    expect(r.stderr).toContain("legacy-a");
    expect(tree(root)).toEqual(before);
  });

  it("drops id and name, leaves a green record, and a second run reports nothing to migrate", () => {
    const root = repo([
      instance,
      [
        "knowledge/a.md",
        "---\nid: a\nname: a\ntitle: A\ndescription: A doc.\nstatus: approved\n---\n\nBody.\n",
      ],
    ]);
    const first = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", ACTOR);
    expect(first.status, first.stderr).toBe(0);
    const written = read(root, "knowledge/a.md");
    expect(written).not.toContain("\nid:");
    expect(written).not.toContain("\nname:");
    expect(refusalsOf(root)).toEqual([]);

    const second = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", ACTOR);
    expect(second.status, second.stderr).toBe(0);
    // The approval instant is a governance act: a second pass must not move it.
    expect(read(root, "knowledge/a.md")).toBe(written);
  });

  it("refuses a malformed --attribute", () => {
    const root = repo([instance]);
    const r = run(root, "migrate", "--attribute", "knowledge/x");
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: bad-args");
  });
});

/**
 * `index.md` and `README.md` in ONE directory both map to `overview.md`, and
 * README-beside-index is an ordinary repository layout — exactly the
 * population migrate exists to convert.
 *
 * The collision guard asked only whether `overview.md` was already on DISK,
 * never whether this run had already claimed it, so both were emptied, both
 * writes went to one path, and the second won: one document's prose deleted,
 * exit 0, nothing printed. Reproduced live before this test was written
 * (2026-08-25) — the dry run showed `+++ b/knowledge/hr/overview.md` twice
 * with different bodies, and `--write` left only the second.
 *
 * Refusing is the only correct answer: migrate never authors knowledge, and
 * choosing which of two documents governs a directory is an authoring
 * decision (record spec §7).
 */
/**
 * Decision 21 again, at the argument seam. `--actor` guarded only against
 * being ABSENT, so any string that was merely wrong went straight into the
 * Governance Policy: `--actor ""` — a CI variable that never got set — wrote
 * `actors: []`, a policy authorising NOBODY, exit 0; and one actor containing
 * a comma became TWO authorities in the emitted YAML, granting approval
 * authority to an identity the operator never named. Both reproduced live
 * (2026-08-25). The validator that rejects them already existed; it was not
 * applied here.
 */
describe("ksor migrate — the actor is validated, not merely present", () => {
  const record = (): string =>
    repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      [
        "knowledge/policy.md",
        "---\ntitle: Policy\ndescription: One sentence.\nstatus: approved\n---\n\nBody.\n",
      ],
    ]);

  it.each([
    ["an empty actor", "", "authorising nobody"],
    [
      "two actors in one string",
      "human:jane, human:john",
      "granting authority to a second identity",
    ],
    ["a bare handle", "jane", "with no kind"],
    ["a team, which is not an individual", "team:people-ops", "which names no person"],
  ])("refuses %s, before writing anything", (_label, value) => {
    const root = record();
    const before = tree(root);
    const r = run(root, "migrate", "--write", "--actor", value);
    expect(r.status, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("--actor");
    expect(tree(root), "migrate wrote despite refusing the actor").toEqual(before);
  });

  it("refuses the same forms on --approve-by", () => {
    const root = record();
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", "");
    expect(r.status, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("--approve-by");
  });

  it("still accepts a well-formed one", () => {
    const root = record();
    expect(run(root, "migrate", "--write", "--actor", ACTOR).status).toBe(0);
  });
});

describe("ksor migrate — two reserved names in one directory", () => {
  const collision = (): string =>
    repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      [
        "knowledge/hr/index.md",
        "---\ntitle: HR\ndescription: The HR section.\nstatus: approved\n---\n\nThe leave-carryover exception, written down nowhere else.\n",
      ],
      [
        "knowledge/hr/README.md",
        "---\ntitle: HR readme\ndescription: How the handbook is maintained.\nstatus: approved\n---\n\nSeparate prose that also exists.\n",
      ],
    ]);

  it("refuses, names both files, and writes nothing", () => {
    const root = collision();
    const before = tree(root);
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", ACTOR);
    expect(r.status, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("ksor-migrate-underivable");
    const said = `${r.stdout}${r.stderr}`;
    expect(said).toContain("knowledge/hr/README.md");
    expect(said).toContain("knowledge/hr/index.md");
    expect(tree(root), "migrate wrote to a record it had refused").toEqual(before);
  });

  it("writes the replacement BEFORE deleting the original it replaces", () => {
    const root = repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      [
        "knowledge/hr/index.md",
        "---\ntitle: HR\ndescription: The HR section.\nstatus: approved\n---\n\nProse that exists nowhere else.\n",
      ],
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    const wrote = r.stdout.indexOf("knowledge/hr/overview.md");
    const deleted = r.stdout.indexOf("deleted knowledge/hr/index.md");
    expect(wrote, `stdout:\n${r.stdout}`).toBeGreaterThan(-1);
    expect(deleted, `stdout:\n${r.stdout}`).toBeGreaterThan(-1);
    // Interrupted between the two, the prose must already exist somewhere.
    expect(wrote, "the delete was applied before its replacement was written").toBeLessThan(
      deleted,
    );
  });

  it("does not refuse when the index is a generated one, which carries no prose", () => {
    const root = repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      ["knowledge/hr/index.md", "# HR\n\n* [HR readme](README.md)\n"],
      [
        "knowledge/hr/README.md",
        "---\ntitle: HR readme\ndescription: How the handbook is maintained.\nstatus: approved\n---\n\nSeparate prose that also exists.\n",
      ],
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--approve-by", ACTOR);
    expect(r.status, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(body(root, "knowledge/hr/overview.md")).toContain("Separate prose that also exists");
  });
});

describe("ksor migrate — the takedown ledger is transcribed once", () => {
  const instance = [
    "instance.md",
    "---\nformat: 1\nname: acme\ndatabase:\n  dsn_env: KSOR_WALK_DSN\n---\n\n# Acme\n\nOne sentence of scope.\n",
  ] as const;
  const concept = [
    "knowledge/a.md",
    "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n",
  ] as const;

  // Reading the denylist is how a pre-profile record's takedowns survive; a
  // record that declares a database whose DSN is absent is refused rather than
  // migrated without them.
  it("refuses a declared database it cannot read, naming the variable", () => {
    const root = repo([instance, concept]);
    const r = run(root, "migrate", "--actor", ACTOR);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: ksor-migrate-underivable");
    expect(r.stderr).toContain("KSOR_WALK_DSN");
  });

  // But only ONCE. A record that already has a ledger has already been
  // migrated, and `ksor takedown` may have appended to it since — so migrate
  // does not read the database at all, let alone regenerate the file from it.
  it("does not touch a ledger that already exists, or the database behind it", () => {
    const root = repo([instance, concept, [".ksor/takedowns.yaml", "[]\n"]]);
    const before = tree(root);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toContain("KSOR_WALK_DSN");
    expect(read(root, ".ksor/takedowns.yaml")).toBe(before.get(".ksor/takedowns.yaml"));
  });
});

describe("ksor migrate --write-site", () => {
  it("offers the byte-copied rule modules as a diff, and copies them under --write", () => {
    const root = repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n"],
      ["system/site/lib/audience-rule.ts", "// an old copy\n"],
    ]);
    const shown = run(root, "migrate", "--actor", ACTOR, "--write-site");
    expect(shown.status, shown.stderr).toBe(0);
    expect(shown.stdout).toContain("+++ b/system/site/lib/audience-rule.ts");
    expect(read(root, "system/site/lib/audience-rule.ts")).toBe("// an old copy\n");

    const applied = run(root, "migrate", "--write", "--actor", ACTOR, "--write-site");
    expect(applied.status, applied.stderr).toBe(0);
    const canonical = readFileSync(
      path.join(repoRoot, "packages/ksor/templates/scaffold/system/site/lib/audience-rule.ts"),
      "utf8",
    );
    expect(read(root, "system/site/lib/audience-rule.ts")).toBe(canonical);
  });

  /**
   * `--write-site` offered `*-rule.ts` and nothing else, so every other
   * adopter-owned site file this release changed — the copied record modules,
   * `source.config.ts`, the staging library — stayed at the pre-profile
   * version and a correctly migrated record could not be built at all.
   */
  it("offers the WHOLE site, stamped the way init stamps it", () => {
    const root = repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n"],
      ["system/site/lib/audience-rule.ts", "// an old copy\n"],
      ["system/site/source.config.ts", "// an old config\n"],
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--write-site");
    expect(r.status, r.stderr).toBe(0);
    const template = path.join(repoRoot, "packages/ksor/templates/scaffold/system/site");
    for (const rel of [
      "source.config.ts",
      "record/check.ts",
      "record/profile.ts",
      "lib/source.ts",
    ]) {
      expect(read(root, `system/site/${rel}`), rel).toBe(
        readFileSync(path.join(template, rel), "utf8"),
      );
    }
    // The stamped file is stamped, not shipped with its placeholder.
    const version = read(root, "system/site/lib/rules-version.ts");
    expect(version).not.toContain("KSOR-STAMP-VERSION");
  });

  // An update, never a creation: a record with no site of its own does not
  // want one conjured into it by a migration.
  it("offers nothing to a record that has no site", () => {
    const root = repo([
      ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
      ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n"],
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR, "--write-site");
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(root, "system"))).toBe(false);
  });
});

/**
 * The two adopter-owned files the migration itself breaks, and which no flag
 * gates: the emitted checker (its own skill says a ksor upgrade replaces it,
 * and nothing did, so a migrated record was refused by the adopter's `check`
 * script and by their shipped CI with fixes that undo the migration) and the
 * root `build` script, which called a `ksor takedown` flag this release
 * removed and died on `error: bad-args`.
 */
describe("ksor migrate — the adopter's own gate", () => {
  const files = [
    ["instance.md", "---\nformat: 1\nname: acme\n---\n\n# Acme\n\nOne sentence of scope.\n"],
    ["knowledge/a.md", "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n"],
    [".agents/skills/format-checker/check.mjs", "// the pre-profile checker\n"],
    [".claude/skills/format-checker/check.mjs", "// the pre-profile checker\n"],
    ["AGENTS.md", "# Acme\n\nThe contract.\n"],
    ["CLAUDE.md", "@AGENTS.md\n"],
    [
      "package.json",
      JSON.stringify(
        {
          name: "acme",
          scripts: {
            dev: "pnpm -C system/site dev",
            build: "pnpm export-denylist && pnpm -C system/site build",
            "export-denylist": "ksor takedown --instance instance.md --export .ksor-denylist.json",
            check: "node .agents/skills/format-checker/check.mjs",
          },
        },
        null,
        2,
      ) + "\n",
    ],
  ] as const;

  it("rewrites both copies of the emitted checker, with no flag", () => {
    const root = repo(files);
    const shown = run(root, "migrate", "--actor", ACTOR);
    expect(shown.status, shown.stderr).toBe(0);
    // A 1,400-line bundle is summarised, not diffed line by line.
    expect(shown.stdout).toContain("@@ generated @@");

    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    const canonical = readFileSync(
      path.join(
        repoRoot,
        "packages/ksor/templates/scaffold/.agents/skills/format-checker/check.mjs",
      ),
      "utf8",
    );
    for (const tree of [".agents", ".claude"]) {
      expect(read(root, `${tree}/skills/format-checker/check.mjs`), tree).toBe(canonical);
    }
    // And the record it just wrote passes that checker — the whole point.
    // (`ksor build` writes the indexes the checker refuses to author.)
    expect(run(root, "build").status).toBe(0);
    const check = spawnSync(
      process.execPath,
      [path.join(root, ".agents/skills/format-checker/check.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    expect(check.status, check.stderr).toBe(0);
  });

  it("drops the export-denylist script and the build step that called it", () => {
    const root = repo(files);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    const manifest = JSON.parse(read(root, "package.json")) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts["export-denylist"]).toBeUndefined();
    expect(manifest.scripts["build"]).toBe("ksor build && pnpm -C system/site build");
    // Everything else is left exactly as the adopter had it.
    expect(manifest.scripts["dev"]).toBe("pnpm -C system/site dev");
  });

  /**
   * A path with a space is quoted, and the strip's `[^\s"]+` could not match a
   * value that starts with a quote — so the flag survived, silently, in the one
   * shape a hand-written script is most likely to have. `--knowledge` refuses
   * like any other unknown flag now, so what survives is not cosmetic: it is
   * the adopter's first `ingest` after upgrading, failing.
   */
  it("strips --knowledge whether the path is bare, `=`-joined or quoted", () => {
    const root = repo([
      files[0],
      files[1],
      [
        "package.json",
        JSON.stringify(
          {
            name: "acme",
            scripts: {
              bare: "ksor ingest --instance instance.md --knowledge ./knowledge --flip",
              joined: "ksor ingest --knowledge=./knowledge --flip",
              quoted: 'ksor ingest --knowledge "my knowledge" --flip',
              "quoted-joined": 'ksor ingest --knowledge="my knowledge" --flip',
            },
          },
          null,
          2,
        ) + "\n",
      ],
    ]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    const scripts = (JSON.parse(read(root, "package.json")) as { scripts: Record<string, string> })
      .scripts;
    for (const [name, script] of Object.entries(scripts)) {
      expect(script, `${name} still carries the flag`).not.toContain("--knowledge");
    }
    expect(scripts["bare"]).toBe("ksor ingest --instance instance.md --flip");
    expect(scripts["quoted"]).toBe("ksor ingest --flip");
  });

  it("leaves a record that carries neither alone", () => {
    const root = repo([files[0], files[1]]);
    const r = run(root, "migrate", "--write", "--actor", ACTOR);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(root, ".agents"))).toBe(false);
    expect(existsSync(path.join(root, "package.json"))).toBe(false);
  });
});

describe("the repository's own fixture corpus is a migrated record", () => {
  const workbench = path.join(repoRoot, "workbench", "example-corpus");

  // Read-only, in process: `check` mode also refuses a stale committed index,
  // so this asserts the indexes in the repository are the ones the tree
  // generates — without writing a byte into the working tree.
  it("passes the record checker, committed indexes included", () => {
    const result = checkRecord(loadRecord(workbench), { mode: "check" });
    expect(result.refusals.map((r) => `${r.path}: ${r.slug}`)).toEqual([]);
    expect(result.concepts.map((c) => [c.id, c.status])).toEqual([
      ["about", "stable"],
      ["policies/purchase-approval", "stable"],
      ["policies/purchase-approval-2019", "deprecated"],
    ]);
  });

  // And end to end through the verb, in a COPY: `ksor build` writes, and a
  // test must never leave the repository dirty.
  it("builds green through the CLI", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ksor-workbench-"));
    roots.push(root);
    cpSync(workbench, root, { recursive: true });
    const r = run(root, "build");
    expect(r.status, r.stderr + r.stdout).toBe(0);
    for (const rel of ["knowledge/index.md", "knowledge/policies/index.md"]) {
      expect(read(root, rel), rel).toBe(readFileSync(path.join(workbench, rel), "utf8"));
    }
  });
});
