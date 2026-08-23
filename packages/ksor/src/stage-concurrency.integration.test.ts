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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const LIB = fileURLToPath(new URL("../templates/scaffold/system/site/lib/", import.meta.url));

/** Node strips types but does not resolve `./audience` — only `./audience.ts`. */
const EXTENSIONLESS = /(from ")(\.\/[A-Za-z0-9._-]+)(")/g;

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
  const got = walk(dir);
  if (got.length !== expected.length) {
    console.error(\`SHORT STAGE: \${got.length} files, expected \${expected.length}\`);
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

function project(root: string, options: { documents: number; audiences: boolean }): Project {
  const site = path.join(root, "system", "site");
  const record = path.join(root, "knowledge");
  mkdirSync(path.join(site, "lib"), { recursive: true });
  mkdirSync(record, { recursive: true });

  const model = options.audiences
    ? "audiences:\n  - public\n  - internal\ndefault_visibility: public\n"
    : "";
  writeFileSync(
    path.join(root, "instance.md"),
    `---\nname: stage-race\n${model}---\n\n# Stage Race\n\nA record used to hold staging honest under concurrency.\n`,
  );
  for (let i = 0; i < options.documents; i += 1) {
    writeFileSync(
      path.join(record, `doc-${i}.md`),
      `---\ntitle: Doc ${i}\nstatus: approved\n---\n\nBody of document ${i}.\n`,
    );
  }

  let rewritten = 0;
  for (const entry of readdirSync(LIB)) {
    const source = readFileSync(path.join(LIB, entry), "utf8");
    rewritten += [...source.matchAll(EXTENSIONLESS)].length;
    writeFileSync(path.join(site, "lib", entry), source.replace(EXTENSIONLESS, "$1$2.ts$3"));
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
    fixture = project(path.join(work, "concurrent"), { documents: DOCUMENTS, audiences: true });
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

  it("leaves the stage holding exactly the record, and no lock behind", () => {
    expect(readdirSync(fixture.stage).length).toBe(DOCUMENTS);
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
    const refusing = project(path.join(work, "refusing"), { documents: 3, audiences: true });
    expect((await stage(refusing.site, 1)).code, "the permissive build should pass").toBe(0);
    expect(existsSync(refusing.stage)).toBe(true);

    // Every document above the build's tier: the record is not empty, this
    // audience's slice of it is.
    for (const entry of readdirSync(refusing.record)) {
      const file = path.join(refusing.record, entry);
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace("status: approved", "visibility: internal"),
      );
    }
    const run = await stage(refusing.site, 1);
    expect(run.code, run.out).not.toBe(0);
    expect(run.out).toContain("ksor-audience-empty");
    expect(existsSync(refusing.stage), "a refused build left its stage on disk").toBe(false);
    expect(existsSync(refusing.lock), "a refused build kept the lock").toBe(false);
  }, 30_000);

  it("a record with no audiences serves itself, and a stale stage is removed", async () => {
    const level0 = project(path.join(work, "level-0"), { documents: 3, audiences: false });
    mkdirSync(level0.stage, { recursive: true });
    writeFileSync(path.join(level0.stage, "left-over.md"), "---\ntitle: Stale\n---\n\nStale.\n");
    const run = await stage(level0.site, 1);
    expect(run.code, run.out).toBe(0);
    expect(run.out.trim().split("\n").pop()).toBe(level0.record);
    expect(
      existsSync(level0.stage),
      "a stage nothing governs outlived the model that made it",
    ).toBe(false);
    expect(existsSync(level0.lock)).toBe(false);
  }, 30_000);
});
