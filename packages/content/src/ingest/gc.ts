/**
 * Reap retired generations past the token grace — converted from the oracle
 * (sor-agentfactory @ b554f91, sor_content/ingest/gc.py), the CLI shell
 * replaced by a library function the `ksor gc` verb composes.
 *
 * DELIBERATE, never implicit: a refresh pipeline calls this as its last step;
 * it can also run by hand. The §5 algebra (`collectableGenerations`)
 * guarantees the active + rollback generations and any generation a live
 * snapshot token could still pin are NEVER collected, and ≥2 complete
 * generations always remain. Reap never touches retrieval_log or
 * takedown_denylist — the ledger and denylist outlive the content they
 * governed.
 */

import type pg from "pg";

import { runIngest } from "../db.js";
import type { ContentInstance } from "../instance.js";
import { collectableGenerations, reap } from "./generation.js";

export interface GcOptions {
  readonly dryRun?: boolean;
  /** Injected clock for tests; defaults to now. */
  readonly now?: Date;
}

export interface GcReport {
  /** What the algebra found collectable, in generation order. */
  readonly collectable: readonly number[];
  /** What was actually reaped (empty on a dry run or when nothing qualifies). */
  readonly reaped: readonly number[];
  readonly dryRun: boolean;
}

/** One transaction (tenant GUC + ingest role): list collectables, then reap each. */
export async function runGc(
  pool: pg.Pool,
  instance: ContentInstance,
  options: GcOptions = {},
): Promise<GcReport> {
  const dryRun = options.dryRun === true;
  return runIngest(pool, instance.tenantId, async (client) => {
    const collectable = await collectableGenerations(client, {
      tenantId: instance.tenantId,
      corpusId: instance.corpusId,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    if (dryRun || collectable.length === 0) {
      return { collectable, reaped: [], dryRun };
    }
    for (const generation of collectable) {
      await reap(client, { tenantId: instance.tenantId, generation });
    }
    return { collectable, reaped: collectable, dryRun };
  });
}
