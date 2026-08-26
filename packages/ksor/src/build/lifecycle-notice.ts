/**
 * What a build says about its own decay.
 *
 * `ksor build` decides machine-surface admission ONCE, at its `as_of`, and
 * writes the answer into files — `llms.txt`, the markdown twins, the bundles.
 * Static output cannot re-decide itself, so the moment a document's
 * `stale_after` passes, those files go on publishing what `ksor serve`, which
 * evaluates the same rule at request time, already refuses. The divergence is
 * specified (record spec §2.5) and inherent to static export; what was missing
 * was anyone SAYING it — the emitted docs stated the exclusion unconditionally,
 * no emitted workflow rebuilds on a schedule, and `ksor build` reported a
 * dropped admission only as a number that went down (found 2026-08-25).
 *
 * A notice, never a refusal. A document past its review date is a governed
 * state with a human surface and a badge of its own; refusing the build would
 * turn "this needs reviewing" into "your record will not compile", and the
 * shortest way out of that would be deleting the `stale_after` — spending the
 * governance to clear the error, which is the failure this repo has now seen
 * twice in one day.
 *
 * Only the clock-decided states are reported. A draft is a draft at every
 * instant and its author knows; printing it on every build is noise, and a
 * notice nobody reads reports nothing.
 */
import type { LifecycleStatus } from "@panaversity/ksor-content/record";

export interface NoticeDoc {
  /** Record-relative, as the lock and the site name it. */
  readonly path: string;
  readonly status: LifecycleStatus;
  /** Epoch ms, or null when unset. */
  readonly effectiveFrom: number | null;
  readonly staleAfter: number | null;
}

/** The machine surfaces a static build writes, named so the reader knows what is affected. */
const SURFACES = "llms.txt, llms-full.txt, the markdown twins and the bundles";

/**
 * The notice for this build, or `""` when no document's admission turns on an
 * instant. `at` is the build's `as_of`, the instant admission was decided at.
 */
export function lifecycleNotice(docs: readonly NoticeDoc[], at: number): string {
  const held: string[] = [];
  let next: { readonly at: number; readonly path: string; readonly key: string } | null = null;
  const coming = (when: number | null, path: string, key: string): void => {
    if (when === null || when <= at) return;
    if (next === null || when < next.at) next = { at: when, path, key };
  };

  for (const doc of docs) {
    // Only `stable` reaches the clock at all: the other two are declined for
    // what they ARE, at every instant, so no rebuild changes them.
    if (doc.status !== "stable") continue;
    if (doc.staleAfter !== null && doc.staleAfter <= at) {
      held.push(`    ${doc.path} — past stale_after ${iso(doc.staleAfter)}`);
    } else if (doc.effectiveFrom !== null && doc.effectiveFrom > at) {
      held.push(`    ${doc.path} — not effective until ${iso(doc.effectiveFrom)}`);
    }
    coming(doc.effectiveFrom, doc.path, "effective_from");
    coming(doc.staleAfter, doc.path, "stale_after");
  }

  if (held.length === 0 && next === null) return "";

  const lines: string[] = [];
  if (held.length > 0) {
    lines.push(
      `  ${held.length} document(s) held off the machine surfaces (${SURFACES}) — each still publishes as a page, with a badge:`,
      ...held,
    );
  }
  if (next !== null) {
    const { at: when, path, key } = next;
    lines.push(
      `  this build decided that at ${iso(at)} and static output cannot re-decide itself:`,
      `    at ${iso(when)} ${path} reaches its ${key}, and until a build runs after that`,
      `    instant these files disagree with \`ksor serve\`, which evaluates at request time.`,
      `    Rebuild and redeploy on a schedule if this record uses stale_after.`,
    );
  }
  return `${lines.join("\n")}\n`;
}

const iso = (ms: number): string => new Date(ms).toISOString();
