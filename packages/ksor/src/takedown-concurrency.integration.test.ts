/**
 * `ksor takedown` writes the record of a governance act, and two operators
 * running it at once must not destroy each other's.
 *
 * The verb read `.ksor/takedowns.yaml`, spent the rest of its run deciding what
 * to write, and then wrote the WHOLE file back. Nothing serialised the two
 * halves, so a second run that read before the first one wrote rewrote the file
 * from its own stale text — and every entry appended in between was gone. It
 * printed "recorded as `<id>`" and exited 0 all the same, because the write
 * succeeded; what it destroyed was somebody else's act, not its own. Measured
 * on a stock `ksor init` scaffold with five concurrent runs: five claims of
 * success, three entries on disk, two withdrawals with no trace anywhere that
 * anyone ever asked for them (2026-08-25).
 *
 * The worse shape is the same line seen from the other side. `writeFileSync`
 * opens with `O_TRUNC`, so the file is ZERO BYTES for the width of the write.
 * That the window is REACHABLE was measured, not reasoned: 3.3% of reads under
 * sustained contention on a real 7 KB ledger, and once in 5,177 reads sampled
 * while ordinary `ksor takedown` processes ran. What it COSTS was then measured
 * by handing the verb that exact state — `parseLedger` read an empty file as a
 * VALID EMPTY LEDGER, so the verb wrote a one-entry ledger over forty and exited
 * 0. There is no restore verb, and the entry a revocation would have to name is
 * one of the ones deleted, so every remedy the resulting refusals print
 * dead-ends.
 *
 * So this suite holds three things, and the third is the one that says which
 * mechanism is underneath: N runs produce N entries and nobody claims an act
 * the file does not hold; a ledger that reads empty is refused rather than
 * believed; and while the race runs, the file's length never goes DOWN — which
 * is true of an append and cannot be true of a rewrite.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

const LEDGER = path.join(".ksor", "takedowns.yaml");

/** A record the takedown verb accepts: an instance, a policy naming the actor, some documents. */
function record(root: string, documents: number): string {
  mkdirSync(path.join(root, ".ksor"), { recursive: true });
  mkdirSync(path.join(root, "knowledge"), { recursive: true });
  writeFileSync(
    path.join(root, "instance.md"),
    "---\nformat: 2\nname: takedown-race\ntitle: Takedown Race\ndescription: A record used to hold the takedown ledger honest under concurrency.\n---\n\nInstructions.\n",
  );
  writeFileSync(
    path.join(root, ".ksor", "governance.yaml"),
    'version: "0.1"\napproval_authorities:\n  - actors: [human:kim]\ntakedown_authorities:\n  actors: [human:kim]\n',
  );
  for (let i = 0; i < documents; i += 1) {
    writeFileSync(
      path.join(root, "knowledge", `doc-${i}.md`),
      `---\ntype: Document\ntitle: Doc ${i}\ndescription: Document ${i}.\nstatus: stable\ngenerated: { by: "test/1", at: 2026-08-01T00:00:00Z }\nksor:\n  approval: { by: "human:kim", at: 2026-08-02T00:00:00Z }\n---\n\nBody of document ${i}.\n`,
    );
  }
  return root;
}

interface Run {
  readonly code: number | null;
  readonly out: string;
}

const args = (root: string, stableId: string, reason: string): string[] => [
  distCli,
  "takedown",
  "--instance",
  path.join(root, "instance.md"),
  "--actor",
  "human:kim",
  "--reason",
  reason,
  stableId,
];

function deny(root: string, stableId: string, reason: string): Run {
  const done = spawnSync(process.execPath, args(root, stableId, reason), { encoding: "utf8" });
  return { code: done.status, out: done.stdout + done.stderr };
}

function denyAsync(root: string, stableId: string, reason: string): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args(root, stableId, reason));
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolve({ code, out }));
  });
}

/** Every `id:` the file holds, in file order — read as TEXT, so a mangled file still counts. */
function ids(root: string): string[] {
  const file = path.join(root, LEDGER);
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/^- id: "([^"]+)"/gm)].map((m) => m[1] ?? "");
}

/** The id a run says it recorded, or null when it claimed nothing. */
function claimed(run: Run): string | null {
  return /recorded as `([^`]+)`/.exec(run.out)?.[1] ?? null;
}

/**
 * Watch the ledger's length while the race runs, from a process of its own: a
 * `readFileSync` loop in this one would block the event loop the children
 * report through. It reports the shortest state any concurrent reader — the
 * verb's own read included — could have been handed.
 */
const SAMPLER = `
import { existsSync, readFileSync } from "node:fs";
const [file, stop, cap] = [process.argv[2], process.argv[3], Number(process.argv[4])];
let shortest = Infinity, empty = 0, reads = 0;
const until = Date.now() + cap;
// The race says when it is over, so the sampler is neither cut short on a slow
// runner nor idling after a fast one; the cap is only so it cannot outlive the
// test that started it.
while (Date.now() < until && !existsSync(stop)) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  reads += 1;
  if (text.length < shortest) shortest = text.length;
  if (text.trim() === "") empty += 1;
}
console.log(JSON.stringify({ reads, shortest, empty }));
`;

let work: string;

beforeAll(() => {
  expect(
    existsSync(distCli),
    `${distCli} is missing — run \`pnpm build\` first; integration tests exercise the built artifact, not src/`,
  ).toBe(true);
  work = mkdtempSync(path.join(tmpdir(), "ksor-takedown-race-"));
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

// Enough contention to lose acts reliably against the old code (five
// concurrent runs lost two of five; eight lose two to six), and few enough
// spawns that a loaded Windows runner still finishes inside the timeout.
const WORKERS = 8;
const ROUNDS = 2;

describe("ksor takedown — concurrent acts are all recorded, or the ones that fail say so", () => {
  it(`${ROUNDS} rounds of ${WORKERS} concurrent runs: every act that claimed success is in the file`, async () => {
    const root = record(path.join(work, "concurrent"), 4);
    // A ledger with history in it, so a run that rewrites the file from stale
    // text destroys entries that were recorded BEFORE this race started.
    const seeded: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const run = deny(root, `knowledge/doc-${i}`, `seed ${i}`);
      expect(run.code, run.out).toBe(0);
      seeded.push(claimed(run)!);
    }
    expect(ids(root)).toEqual(seeded);

    let expected = seeded.length;
    for (let round = 0; round < ROUNDS; round += 1) {
      const runs = await Promise.all(
        Array.from({ length: WORKERS }, (_, n) =>
          denyAsync(root, `knowledge/round-${round}-${n}`, `round ${round} worker ${n}`),
        ),
      );

      // A run that could not record its act must FAIL — never a success
      // message for an act the record does not carry.
      for (const run of runs) {
        if (run.code !== 0) {
          expect(claimed(run), `a failed run still claimed an act:\n${run.out}`).toBeNull();
        }
      }

      const claims = runs.map(claimed).filter((id): id is string => id !== null);
      const onDisk = ids(root);
      expect(
        claims.filter((id) => !onDisk.includes(id)),
        `round ${round}: ${claims.length} run(s) reported "recorded as", and the ledger holds ${onDisk.length} entries`,
      ).toEqual([]);

      // Nothing recorded earlier may leave, this round's or any other's.
      expect(onDisk.slice(0, seeded.length), `round ${round}: the seeded acts`).toEqual(seeded);
      expected += claims.length;
      expect(onDisk.length, `round ${round}: entries on disk`).toBe(expected);
    }

    // With a bound this generous, every run should have got its turn: an
    // operator who is refused here is a defect of a different kind.
    expect(expected, "all runs recorded").toBe(4 + WORKERS * ROUNDS);
  }, 180_000);

  it("the file never gets SHORTER while concurrent runs write it", async () => {
    const root = record(path.join(work, "monotonic"), 1);
    // History to lose: every rewrite of a file this size truncates it first,
    // and the sampler is watching for exactly that dip.
    for (let i = 0; i < 10; i += 1) {
      expect(deny(root, `knowledge/seed-${i}`, `seed ${i}`).code).toBe(0);
    }
    const before = readFileSync(path.join(root, LEDGER), "utf8").length;

    const script = path.join(work, "sample-ledger.mjs");
    const stop = path.join(work, "sampler.stop");
    writeFileSync(script, SAMPLER);
    const sampler = new Promise<Run>((resolve) => {
      const child = spawn(process.execPath, [script, path.join(root, LEDGER), stop, "150000"]);
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.on("close", (code) => resolve({ code, out }));
    });

    for (let round = 0; round < ROUNDS; round += 1) {
      await Promise.all(
        Array.from({ length: WORKERS }, (_, n) =>
          denyAsync(root, `knowledge/mono-${round}-${n}`, `mono ${round} ${n}`),
        ),
      );
    }
    writeFileSync(stop, "");
    const seen = JSON.parse((await sampler).out) as {
      reads: number;
      shortest: number;
      empty: number;
    };

    expect(seen.reads, "the sampler read nothing — it is not watching the race").toBeGreaterThan(
      100,
    );
    expect(
      seen.empty,
      `a concurrent reader was handed an EMPTY ledger ${seen.empty} time(s) in ${seen.reads} reads`,
    ).toBe(0);
    expect(
      seen.shortest,
      `the ledger was ${before} bytes before the race and observable at ${seen.shortest} during it`,
    ).toBeGreaterThanOrEqual(before);
  }, 180_000);
});

describe("ksor takedown — a ledger that reads empty is refused, never taken for `no denials`", () => {
  it("refuses to write over a ledger file that exists and is empty", () => {
    const root = record(path.join(work, "empty"), 2);
    for (let i = 0; i < 2; i += 1)
      expect(deny(root, `knowledge/doc-${i}`, `seed ${i}`).code).toBe(0);
    const file = path.join(root, LEDGER);
    expect(ids(root).length).toBe(2);

    // Exactly what a reader landing inside `writeFileSync`'s truncation window
    // is handed. A file that EXISTS and holds nothing is a state no writer
    // produces; reading it as "this record has withdrawn nothing" republishes
    // every act it ever recorded.
    writeFileSync(file, "");
    const run = deny(root, "knowledge/doc-0", "the losing process");
    expect(run.code, run.out).not.toBe(0);
    expect(claimed(run), `it claimed an act over an empty ledger:\n${run.out}`).toBeNull();
    expect(
      readFileSync(file, "utf8"),
      "it wrote a one-entry ledger over the empty file rather than refusing",
    ).toBe("");
  });

  it("refuses to READ one too — the same file, on the surfaces that only look", () => {
    const root = record(path.join(work, "empty-read"), 1);
    expect(deny(root, "knowledge/doc-0", "seed").code).toBe(0);
    writeFileSync(path.join(root, LEDGER), "   \n\n");
    const listed = spawnSync(
      process.execPath,
      [distCli, "takedown", "--instance", path.join(root, "instance.md"), "--list"],
      { encoding: "utf8" },
    );
    expect(listed.status, listed.stdout + listed.stderr).not.toBe(0);
    expect(listed.stdout + listed.stderr).toContain("ksor-ledger-");
  });

  it("a record with NO ledger file still records the first act — absence is not emptiness", () => {
    const root = record(path.join(work, "absent"), 1);
    expect(existsSync(path.join(root, LEDGER))).toBe(false);
    const run = deny(root, "knowledge/doc-0", "the first act");
    expect(run.code, run.out).toBe(0);
    expect(ids(root).length).toBe(1);
  });
});
