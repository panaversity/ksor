/**
 * The two mechanisms under `ksor takedown`'s write, each on its own.
 *
 * The verb's suite (`packages/ksor/src/takedown-concurrency.integration.test.ts`)
 * proves the OUTCOME — N concurrent runs record N acts. This one proves the
 * parts it cannot reach through the CLI: what happens to a lock whose holder
 * died, what happens when nobody releases at all, and that the append survives
 * a writer who never took the lock in the first place.
 *
 * That last one is why there are two mechanisms rather than one. A lock is a
 * convention, and critical rule 1 does not let a governance guarantee rest on
 * one.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { LedgerLocked, withLedgerLock, writeLedgerEntry } from "./ledger-file.js";
import { parseLedger, type LedgerEntry } from "./record/ledger.js";

const work = mkdtempSync(join(tmpdir(), "ksor-ledger-file-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let made = 0;
/** A record's `.ksor/` exists — the policy lives in it — so these paths do too. */
function ledgerPath(create = true): string {
  made += 1;
  const path = join(work, `ledger-${made}`, "takedowns.yaml");
  if (create) mkdirSync(dirname(path), { recursive: true });
  return path;
}

function denial(n: number): LedgerEntry {
  const at = new Date(Date.UTC(2026, 7, 25, 10, 0, n)).toISOString();
  return {
    kind: "denial",
    id: `${at}-${n.toString(16).padStart(6, "0")}`,
    by: "human:ciso",
    at,
    reason: `act ${n}`,
    stableId: `knowledge/doc-${n}`,
    scope: "node",
    expected: "present",
  };
}

const idsIn = (path: string): string[] => {
  const parsed = parseLedger(readFileSync(path, "utf8"), path);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.refusals));
  return [...parsed.ledger.ids];
};

describe("withLedgerLock", () => {
  it("hands `work` the text as it stands INSIDE the lock, and creates the directory", () => {
    const path = ledgerPath(false);
    expect(existsSync(dirname(path))).toBe(false);
    expect(withLedgerLock(path, (text) => text)).toBeNull();
    writeLedgerEntry(path, null, denial(1));
    expect(withLedgerLock(path, (text) => text)).toContain("knowledge/doc-1");
  });

  it("releases the lock even when the work throws — a refused act must not wedge the record", () => {
    const path = ledgerPath();
    expect(() =>
      withLedgerLock(path, () => {
        throw new Error("refused");
      }),
    ).toThrow("refused");
    expect(existsSync(`${path}.lock`)).toBe(false);
    expect(withLedgerLock(path, () => "took it")).toBe("took it");
  });

  it("breaks a lock whose holder is gone rather than waiting on a dead process", () => {
    const path = ledgerPath();
    // A pid nothing can be running under, so the probe answers "gone".
    writeFileSync(`${path}.lock`, "2147483646");
    expect(withLedgerLock(path, () => "took it", 200)).toBe("took it");
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("breaks a lock a holder died before stamping", () => {
    const path = ledgerPath();
    writeFileSync(`${path}.lock`, "");
    expect(withLedgerLock(path, () => "took it", 200)).toBe("took it");
  });

  it("refuses rather than waiting forever, and the refusal says who is holding it", () => {
    const path = ledgerPath();
    // THIS process is alive, so the lock is not abandoned and the bound is the
    // only thing that ends the wait.
    writeFileSync(`${path}.lock`, String(process.pid));
    let raised: unknown;
    try {
      withLedgerLock(path, () => "should never run", 100);
    } catch (exc) {
      raised = exc;
    }
    expect(raised).toBeInstanceOf(LedgerLocked);
    const message = (raised as Error).message;
    expect(message).toContain("ksor-ledger-locked");
    expect(message, "the evidence names the holder it probed").toContain(String(process.pid));
    expect(message, "and what a signal-0 probe can honestly say about it").toContain("RECYCLED");
    expect(message).toContain("fix:");
    // Nothing was written, and the lock is somebody else's to remove.
    expect(existsSync(path)).toBe(false);
    expect(readFileSync(`${path}.lock`, "utf8")).toBe(String(process.pid));
    rmSync(`${path}.lock`);
  });
});

describe("writeLedgerEntry — the append is the guarantee, not the lock", () => {
  it("adds one entry and leaves every earlier byte where it was", () => {
    const path = ledgerPath();
    const first = writeLedgerEntry(path, null, denial(1));
    const second = writeLedgerEntry(path, first, denial(2));
    expect(second.startsWith(first)).toBe(true);
    expect(idsIn(path)).toEqual([denial(1).id, denial(2).id]);
  });

  it("writes the header once, with the first entry and never again", () => {
    const path = ledgerPath();
    writeLedgerEntry(path, null, denial(1));
    for (let n = 2; n <= 4; n += 1) {
      writeLedgerEntry(path, readFileSync(path, "utf8"), denial(n));
    }
    const header = readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.startsWith("#"));
    expect(header.length).toBe(3);
  });

  it("appends behind writers it never saw, instead of writing over them", () => {
    // The state no lock can rule out: something wrote between our read and our
    // write. `stale` is what we read — the argument the old code wrote back
    // over the whole file, deleting everything appended in between.
    const path = ledgerPath();
    const stale = writeLedgerEntry(path, null, denial(1));
    let length = stale.length;
    for (const n of [2, 3, 4]) {
      // Every one of these decides from the SAME out-of-date text.
      const after = writeLedgerEntry(path, stale, denial(n));
      expect(after.length, `entry ${n} shortened the file`).toBeGreaterThan(length);
      length = after.length;
    }
    expect(idsIn(path), "an act was written over rather than appended behind").toEqual([
      denial(1).id,
      denial(2).id,
      denial(3).id,
      denial(4).id,
    ]);
  });

  it("a file with no trailing newline gets one, so an entry never joins another's last line", () => {
    const path = ledgerPath();
    const first = writeLedgerEntry(path, null, denial(1));
    writeFileSync(path, first.replace(/\n$/, ""));
    const text = writeLedgerEntry(path, readFileSync(path, "utf8"), denial(2));
    expect(text).toContain("\n- id:");
    expect(idsIn(path)).toEqual([denial(1).id, denial(2).id]);
  });
});
