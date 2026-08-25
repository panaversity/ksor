/**
 * The takedown ledger as a FILE: who is writing it right now, and how the
 * bytes land.
 *
 * `ksor takedown` reads the ledger, decides what the act is, and writes. Those
 * were three steps with nothing between them, so two operators running the
 * verb at once — a person and a CI job, two agents, one person on two
 * documents — each read the same file and each wrote it back whole. Every
 * entry appended in between was deleted, and both runs printed "recorded as
 * `<id>`" and exited 0, because their own write had succeeded. Reproduced on a
 * stock `ksor init` scaffold with no database at all: five runs, five claims of
 * success, three entries, two withdrawn documents still published with nothing
 * in the record saying anyone had ever asked (2026-08-25).
 *
 * TWO mechanisms, and they answer different failures:
 *
 * 1. **This lock** serialises read → decide → append, so N runs record N acts.
 *    It is what makes the count right.
 * 2. **`O_APPEND`** (`writeLedgerEntry`) is what makes the loss impossible
 *    rather than merely unlikely. The lock is advisory — an older `ksor`, a
 *    broken lock, a filesystem that does not honour `wx` — and an append
 *    survives all three: the kernel places the bytes at the end of the file
 *    whatever else is happening, so a run that ignores the lock adds an entry
 *    instead of replacing the file. The worst a lost lock can do is order two
 *    acts differently. Critical rule 1: the guarantee does not rest on the
 *    convention.
 *
 * The stage lock (`system/site/lib/stage-knowledge.ts`) is the same primitive
 * and paid for the same lessons — `wx` as the whole of the acquire, `EPERM` as
 * Windows's spelling of `EEXIST`, a pid that decides whether to break and a
 * clock that decides when to give up, and a blank lock looked at TWICE. What
 * DIFFERS here is what happens to an abandoned one, and the difference is the
 * point: the stage refuses rather than breaking, because staging removes and
 * refills a directory in place and breaking that lock publishes a half-written
 * record. Appending a few hundred bytes has no half-written state, so a lock
 * whose holder is gone is broken here and the wait is much shorter — a
 * takedown holds this for milliseconds, and a minute of waiting is not
 * contention, it is a corpse.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { bytesToAppend, type LedgerEntry } from "./record/ledger.js";

/** A takedown holds this for the width of one append; the bound is for a holder that died. */
const GIVE_UP_MS = 30_000;
const POLL_MS = 20;

/**
 * Nobody released the ledger inside the bound. Thrown rather than returned
 * because every caller's answer is the same one — refuse, and record nothing.
 */
export class LedgerLocked extends Error {
  readonly lockFile: string;
  readonly heldMs: number;
  readonly holder: string;

  constructor(lockFile: string, heldMs: number, holder: string) {
    super(
      `ksor-ledger-locked: ${lockFile} has been held for ${heldMs}ms\n` +
        `  why: one \`ksor takedown\` writes the ledger at a time, so the act it records is never ` +
        `written over another one. A takedown holds the file for the width of one append, so a ` +
        `holder still holding after ${heldMs}ms ` +
        `is not writing — it was killed before it could release (Ctrl-C, a cancelled job, an OOM: ` +
        `none of them run the code that removes this file), and a lock whose holder is GONE is ` +
        `broken automatically, so this one still looks alive. Evidence: ${holder}\n` +
        `  fix: wait for the other takedown to finish; if none is running, delete ${lockFile} and run the verb again`,
    );
    this.name = "LedgerLocked";
    this.lockFile = lockFile;
    this.heldMs = heldMs;
    this.holder = holder;
  }
}

/**
 * Hold the ledger's lock for `work`, which is handed the file's text as it
 * stands INSIDE the lock — never a copy read before the wait.
 *
 * That argument is not a convenience. The whole defect was a decision made
 * from text read before another process wrote, so the read moves in here where
 * it cannot be stale, and a caller cannot accidentally keep using the old one.
 *
 * `giveUpMs` is a parameter for one reason, stated rather than disguised: the
 * refusal is the branch that must never be wrong — a run that waits forever is
 * a hang and a run that gives up early loses an act — and a test cannot wait
 * out the product's bound to reach it.
 */
export function withLedgerLock<T>(
  ledgerPath: string,
  work: (text: string | null) => T,
  giveUpMs: number = GIVE_UP_MS,
): T {
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const lockFile = `${ledgerPath}.lock`;
  let waited = 0;
  for (;;) {
    try {
      // `wx` is the whole primitive: create-if-absent, atomically, on every
      // filesystem Node supports — and it stamps the holder's pid in the same
      // call, so a waiter can tell a live holder from a killed one.
      writeFileSync(lockFile, String(process.pid), { flag: "wx" });
      break;
    } catch (error) {
      // EEXIST is "someone holds it"; on Windows a create against a name in the
      // pending-delete state raises EPERM for the same situation, and rethrowing
      // it fails the ordinary contended case a few milliseconds wide.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM") throw error;
      if (abandoned(lockFile)) {
        rmSync(lockFile, { force: true });
        continue;
      }
      if (waited >= giveUpMs) throw new LedgerLocked(lockFile, waited, evidence(lockFile));
      sleep(POLL_MS);
      waited += POLL_MS;
    }
  }
  try {
    return work(existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : null);
  } finally {
    rmSync(lockFile, { force: true });
  }
}

/**
 * Add one entry to the ledger, and answer with the file as it now stands.
 *
 * `appendFileSync` and never `writeFileSync`: the file is opened `O_APPEND`,
 * so the bytes go after whatever is already there — including bytes written
 * since `text` was read — and the file has no state in which it is shorter
 * than it was.
 */
export function writeLedgerEntry(
  ledgerPath: string,
  text: string | null,
  entry: LedgerEntry,
): string {
  appendFileSync(ledgerPath, bytesToAppend(text, entry), "utf8");
  return readFileSync(ledgerPath, "utf8");
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Is this lock stamped with a process that no longer exists?
 *
 * Blank is the one ambiguous read: the holder writes its pid in the call that
 * creates the file, so a blank lock is either a holder caught between the two
 * (microseconds) or one that died there (forever). Looking twice tells them
 * apart, and only the second look may break a lock.
 */
function abandoned(lockFile: string): boolean {
  for (const look of [0, 1]) {
    let stamp: string;
    try {
      stamp = readFileSync(lockFile, "utf8").trim();
    } catch {
      // Released while we read it; the next acquire attempt takes it.
      return false;
    }
    const pid = Number(stamp);
    if (Number.isInteger(pid) && pid > 0) return probe(pid) === "gone";
    if (look === 0) sleep(POLL_MS * 2);
  }
  return true;
}

/**
 * What a signal-0 probe can honestly say. Three answers, because the middle
 * one proves nothing: EPERM says something with that id exists and is not ours
 * to signal, which is also what a RECYCLED pid owned by another user looks
 * like.
 */
function probe(pid: number): "alive" | "not-ours" | "gone" {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM" ? "not-ours" : "gone";
  }
}

/** Everything the lock file can honestly say about who is holding it. */
function evidence(lockFile: string): string {
  let stamp = "";
  try {
    stamp = readFileSync(lockFile, "utf8").trim();
  } catch {
    // Released as we read it — say so rather than inventing a holder.
  }
  const pid = Number(stamp);
  if (!Number.isInteger(pid) || pid <= 0) {
    return `the file records no usable pid (${stamp === "" ? "it is empty" : JSON.stringify(stamp)})`;
  }
  return {
    alive: `process ${pid} is alive to a signal-0 probe — but a RECYCLED pid is alive too, so that is not proof this holder is the one that took the lock`,
    "not-ours": `signalling process ${pid} raised EPERM: something with that id exists and is not ours to signal, which is also what a RECYCLED pid owned by another user produces`,
    gone: `process ${pid} is gone, and this lock should already have been broken`,
  }[probe(pid)];
}
