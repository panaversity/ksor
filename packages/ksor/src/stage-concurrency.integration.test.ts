/**
 * The stage survives a build that evaluates its config more than once.
 *
 * A site build evaluates `source.config.ts` in more than one process, and
 * staging was destructive on every evaluation: delete the whole stage, refill
 * it. Two of those overlapping is the ordinary case, not a rare interleaving —
 * this suite, against the code as it stood, failed 42 of 48 worker runs in four
 * shapes: `ENOENT` and `EINVAL` out of `copyFileSync` (the reported symptom,
 * issue #100), `ENOTEMPTY` out of `rmSync` despite its retries, and — the
 * majority, 27 of 48 — no error at all: staging returned SUCCESS and handed the
 * build a stage a third of the record short.
 *
 * The silent shape is what these tests are really for. A crash fails a build; a
 * short stage publishes one, with documents missing from /docs, llms.txt and
 * the search index, and nothing anywhere saying so. So every worker does not
 * merely stage — it reads back what it was handed and checks it against the
 * record, which is exactly what the build does next.
 *
 * The scaffold's site lib is TypeScript that Next compiles; here it runs under
 * Node's own type stripping, which needs explicit extensions on relative
 * imports. That rewrite is the ONE difference between this harness and the
 * shipped module, and it is asserted rather than assumed.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SITE = fileURLToPath(new URL("../templates/scaffold/system/site/", import.meta.url));
const KSOR_NODE_MODULES = fileURLToPath(new URL("../node_modules/", import.meta.url));

/** Node strips types but resolves neither `./x` nor `./x.js` to `x.ts`. */
const RELATIVE_IMPORT = /(from ")(\.{1,2}\/[A-Za-z0-9._/-]+?)(\.js)?(")/g;

/** One worker: stage, then read back what staging handed us, `rounds` times. */
const HARNESS = `
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { knowledgeSourceDir } from "./lib/stage-knowledge.ts";

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

const record = path.resolve("../../knowledge");
const expected = walk(record);
const rounds = Number(process.argv[2] ?? 1);

for (let i = 0; i < rounds; i += 1) {
  const dir = path.resolve(knowledgeSourceDir());
  // Every record file, plus the ONE regenerated index (a flat record has one).
  const got = walk(dir);
  if (got.length !== expected.length + 1) {
    console.error(\`SHORT STAGE: \${got.length} files, expected \${expected.length + 1}\`);
    process.exit(3);
  }
  for (const from of expected) {
    const to = path.join(dir, path.relative(record, from));
    if (!readFileSync(from).equals(readFileSync(to))) {
      console.error(\`WRONG BYTES: \${to}\`);
      process.exit(4);
    }
  }
}
console.log(path.resolve(knowledgeSourceDir()));
`;

interface Project {
  readonly root: string;
  readonly site: string;
  readonly record: string;
  readonly stage: string;
  readonly lock: string;
}

function sha(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** A conformant profile record: `documents` stable concepts, a policy, and a fresh lock. */
function project(root: string, options: { documents: number; audience: string }): Project {
  const site = path.join(root, "system", "site");
  const record = path.join(root, "knowledge");
  mkdirSync(path.join(site, "lib"), { recursive: true });
  mkdirSync(path.join(root, ".ksor"), { recursive: true });
  mkdirSync(record, { recursive: true });

  writeFileSync(
    path.join(root, "instance.md"),
    "---\nformat: 2\nname: stage-race\ntitle: Stage Race\ndescription: A record used to hold staging honest under concurrency.\n---\n\nInstructions.\n",
  );
  writeFileSync(
    path.join(root, ".ksor", "governance.yaml"),
    'version: "0.1"\naudiences:\n  internal:\n    description: Employees\napproval_authorities:\n  - actors: [human:kim]\ntakedown_authorities:\n  actors: [human:kim]\n',
  );
  const documents: { path: string; sha256: string }[] = [];
  for (let i = 0; i < options.documents; i += 1) {
    const file = path.join(record, `doc-${i}.md`);
    writeFileSync(
      file,
      `---\ntype: Document\ntitle: Doc ${i}\ndescription: Document ${i}.\nstatus: stable\ngenerated: { by: "test/1", at: 2026-08-01T00:00:00Z }\nksor:\n  audience: [${options.audience}]\n  approval: { by: "human:kim", at: 2026-08-02T00:00:00Z }\n---\n\nBody of document ${i}.\n`,
    );
    documents.push({ path: `doc-${i}.md`, sha256: sha(file) });
  }
  // The lock's freshness claim covers the three control files too, so the
  // harness has to hash the ones it just wrote.
  const sha256Text = (text: string): string =>
    createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  writeFileSync(
    path.join(root, "build.lock.json"),
    JSON.stringify({
      format: 1,
      build_id: "sha256:test",
      ksor_version: "0.1.0",
      source_commit: null,
      dirty: false,
      as_of: "2026-08-25T12:00:00Z",
      drafts: "hidden",
      instance_sha256: sha256Text(readFileSync(path.join(root, "instance.md"), "utf8")),
      policy_sha256: sha256Text(readFileSync(path.join(root, ".ksor", "governance.yaml"), "utf8")),
      people_sha256: sha256Text(""),
      ledger_sha256: sha256Text(""),
      ledger_entries: [],
      audiences: { registry: ["internal"] },
      documents,
      companions: [],
      assets: [],
      // This record commits no `index.md`, and a real `ksor build` would record
      // the empty list rather than omit the key — the site's reader requires
      // it, because a lock that cannot say what it wrote into the indexes is a
      // lock from a ksor that did not check them.
      indexes: [],
    }),
  );

  // Copied whole, subdirectories included: the scaffold's lib gained `auth/`
  // when sign-in landed, and a flat read broke on the directory. What this
  // harness needs is the staging modules, but copying the tree is both simpler
  // and immune to the next directory that appears beside them. The record
  // module beside it, and its two runtime deps linked from this package.
  let rewritten = 0;
  const copyLib = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      if (entry.isDirectory()) {
        copyLib(source, target);
        continue;
      }
      const text = readFileSync(source, "utf8");
      rewritten += [...text.matchAll(RELATIVE_IMPORT)].length;
      writeFileSync(target, text.replace(RELATIVE_IMPORT, "$1$2.ts$4"));
    }
  };
  copyLib(path.join(SITE, "lib"), path.join(site, "lib"));
  copyLib(path.join(SITE, "record"), path.join(site, "record"));
  writeFileSync(
    path.join(site, "lib", "rules-version.ts"),
    'export const RULES_VERSION: string = "0.1.0";\n',
  );
  mkdirSync(path.join(site, "node_modules"), { recursive: true });
  for (const dep of ["yaml", "zod"]) {
    const link = path.join(site, "node_modules", dep);
    if (!existsSync(link)) symlinkSync(path.join(KSOR_NODE_MODULES, dep), link, "dir");
  }
  expect(
    rewritten,
    "the harness rewrote no imports — it is not running the scaffold's lib",
  ).toBeGreaterThan(0);
  writeFileSync(path.join(site, "stage-once.mjs"), HARNESS);

  return {
    root,
    site,
    record,
    stage: path.join(site, ".staged-knowledge"),
    lock: path.join(site, ".staged-knowledge.lock"),
  };
}

interface Run {
  readonly code: number | null;
  readonly out: string;
}

function stage(site: string, rounds: number): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["stage-once.mjs", String(rounds)], { cwd: site });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const DOCUMENTS = 150;
const WORKERS = 6;
const ROUNDS = 3;

describe("staging under a build that evaluates its config more than once", () => {
  let work: string;
  let fixture: Project;

  beforeAll(() => {
    // realpath: on macOS the tmpdir is a symlink, so a child's cwd resolves to
    // /private/var while this path says /var, and every path comparison below
    // would compare two spellings of the same directory.
    work = realpathSync(mkdtempSync(path.join(tmpdir(), "ksor-stage-race-")));
    fixture = project(path.join(work, "concurrent"), { documents: DOCUMENTS, audience: "public" });
  });

  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it(`${WORKERS} concurrent evaluations each get the WHOLE record, byte for byte`, async () => {
    const runs = await Promise.all(
      Array.from({ length: WORKERS }, () => stage(fixture.site, ROUNDS)),
    );
    const failed = runs.filter((run) => run.code !== 0);
    expect(
      failed.length,
      failed
        .map((run) => run.out)
        .join("\n")
        .slice(-3000),
    ).toBe(0);
    // Every worker was handed the same staged directory.
    expect(new Set(runs.map((run) => run.out.trim().split("\n").pop()))).toEqual(
      new Set([fixture.stage]),
    );
  }, 60_000);

  it("leaves the stage holding exactly the record and its index, and no lock behind", () => {
    expect(readdirSync(fixture.stage).length).toBe(DOCUMENTS + 1);
    expect(existsSync(fixture.lock), "a lock outlived the build that took it").toBe(false);
  });

  it("breaks a lock whose holder is gone, rather than waiting on a dead process", async () => {
    // A build killed mid-stage leaves its lock. Nothing else will ever remove
    // it, so a waiter that trusts the file forever hangs every later build.
    writeFileSync(fixture.lock, "2147483646");
    const run = await stage(fixture.site, 1);
    expect(run.code, run.out).toBe(0);
    expect(existsSync(fixture.lock)).toBe(false);
  }, 30_000);

  it("breaks a lock a holder died before stamping", async () => {
    // The pid is written in the call that creates the file, so a BLANK lock is
    // a holder that died between the two — indistinguishable from a live one
    // on a single look, which is why the check looks twice.
    writeFileSync(fixture.lock, "");
    const run = await stage(fixture.site, 1);
    expect(run.code, run.out).toBe(0);
    expect(existsSync(fixture.lock)).toBe(false);
  }, 30_000);

  it("a refused build leaves no stage — the previous, wider one must not survive", async () => {
    const refusing = project(path.join(work, "refusing"), { documents: 3, audience: "public" });
    expect((await stage(refusing.site, 1)).code, "the permissive build should pass").toBe(0);
    expect(existsSync(refusing.stage)).toBe(true);

    // Every document outside the [public] viewer: the record is not empty,
    // this viewer's slice of it is. Rewritten in place with a fresh lock, so
    // the refusal is the viewer's and not the lock's.
    project(path.join(work, "refusing"), { documents: 3, audience: "internal" });
    const run = await stage(refusing.site, 1);
    expect(run.code, run.out).not.toBe(0);
    expect(run.out).toContain("ksor-audience-empty");
    expect(existsSync(refusing.stage), "a refused build left its stage on disk").toBe(false);
    expect(existsSync(refusing.lock), "a refused build kept the lock").toBe(false);
  }, 30_000);

  it("a stale stage from an earlier build is replaced, never merged", async () => {
    const fresh = project(path.join(work, "stale-stage"), { documents: 3, audience: "public" });
    mkdirSync(fresh.stage, { recursive: true });
    writeFileSync(path.join(fresh.stage, "left-over.md"), "---\ntitle: Stale\n---\n\nStale.\n");
    const run = await stage(fresh.site, 1);
    expect(run.code, run.out).toBe(0);
    expect(
      existsSync(path.join(fresh.stage, "left-over.md")),
      "a file no plan produced outlived the stage that held it",
    ).toBe(false);
    expect(existsSync(path.join(fresh.stage, "index.md"))).toBe(true);
    expect(existsSync(fresh.lock)).toBe(false);
  }, 30_000);
});
