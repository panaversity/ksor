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

  it("refuses a malformed --attribute", () => {
    const root = repo([instance]);
    const r = run(root, "migrate", "--attribute", "knowledge/x");
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")[0]).toBe("error: bad-args");
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
