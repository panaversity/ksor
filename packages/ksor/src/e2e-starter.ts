import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The PRODUCER actor that approved the sample documents `ksor init` emits.
 *
 * The starter ships `status: stable` with `ksor.approval` naming
 * `ksor-starter/<cli version>`, and the emitted `.ksor/governance.yaml`
 * authorises it — that is what makes a fresh record publish on its first
 * build. A suite that REPLACES the emitted policy with its own actors takes
 * that authority away, and `checkAgainstPolicy` then refuses all five with
 * `ksor-approver-unauthorised` before any surface is rendered: every clause
 * fails on the authority check rather than on what it means to test.
 *
 * So a walkthrough that needs its own approver names it BESIDE this one,
 * which is also what an adopter does — the emitted policy comment tells them
 * to drop the producer only once the samples are gone.
 *
 * The version is stamped at init time and cannot be hard-coded here, so it is
 * read back from the policy the run under test actually emitted.
 */
export function starterApprover(projectDir: string): string {
  const policyPath = path.join(projectDir, ".ksor", "governance.yaml");
  // Comments stripped FIRST: the emitted policy explains the actor in a comment
  // that spells it "`ksor-starter/...`", and a scan of the raw file returns that
  // literal — a policy naming an actor no document is approved by, which refuses
  // the build for the exact reason this function exists to avoid.
  const declared = readFileSync(policyPath, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const actor = /ksor-starter\/[^\s,\]]+/.exec(declared)?.[0];
  if (actor === undefined) {
    throw new Error(
      `${policyPath} names no ksor-starter producer — the emitted starter no longer ` +
        `approves its own samples, so a suite that keeps this actor is asserting a state ` +
        `\`ksor init\` does not produce.`,
    );
  }
  return actor;
}
