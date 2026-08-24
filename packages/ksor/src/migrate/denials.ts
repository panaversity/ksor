/**
 * The denylist rows a pre-profile record kept only in Postgres, read once so
 * they can become ledger entries in the repository (research/okf-native.md
 * §1.5: direction is file → database, always).
 *
 * Every entry names WHO denied. The actor comes from the `takedown_applied`
 * row the verb wrote at the time; where the log no longer has one — a row
 * written before that logging existed, or a trimmed log — migrate refuses and
 * asks for `--attribute`, because a governance act may never name an actor the
 * tool guessed (decision 21).
 */
import { createHash } from "node:crypto";

import { contentPool, parseInstance, runAuditRead, runRead } from "@panaversity/ksor-content";

export interface DbDenial {
  readonly stableId: string;
  readonly scope: "node" | "subtree";
  readonly reason: string;
  /** The row's `created_at`, as the instant the ledger entry records. */
  readonly at: string;
  /** From the latest `takedown_applied` log row for this stable_id, or null. */
  readonly actor: string | null;
}

/** Reads the rows and their attribution; the pool is opened and closed here. */
export async function readDbDenials(
  instancePath: string,
  dsn: string,
): Promise<readonly DbDenial[]> {
  const instance = parseInstance(instancePath);
  const pool = contentPool(dsn);
  try {
    const rows = await runRead(pool, instance.tenantId, async (client) => {
      const r = await client.query(
        "SELECT stable_id, scope, reason, created_at FROM takedown_denylist" +
          " WHERE tenant_id = $1 AND corpus_id = $2 ORDER BY created_at, stable_id",
        [instance.tenantId, instance.corpusId],
      );
      return r.rows as Record<string, unknown>[];
    });
    // The audit role reads the provenance trail (schema 2.3); `detail` carries
    // the stable_id the act named.
    const log = await runAuditRead(pool, instance.tenantId, async (client) => {
      const r = await client.query(
        "SELECT actor, detail, created_at FROM retrieval_log" +
          " WHERE tenant_id = $1 AND corpus_id = $2 AND action = 'takedown_applied'" +
          " ORDER BY created_at ASC, id ASC",
        [instance.tenantId, instance.corpusId],
      );
      return r.rows as Record<string, unknown>[];
    });
    const actorOf = new Map<string, string>();
    for (const row of log) {
      const detail = (row["detail"] ?? {}) as Record<string, unknown>;
      const stableId = detail["stable_id"];
      if (typeof stableId === "string") actorOf.set(stableId, String(row["actor"]));
    }
    return rows.map((row) => ({
      stableId: String(row["stable_id"]),
      scope: String(row["scope"]) === "subtree" ? "subtree" : "node",
      reason: String(row["reason"] ?? ""),
      at: (row["created_at"] as Date).toISOString().replace(/\.\d+Z$/, "Z"),
      actor: actorOf.get(String(row["stable_id"])) ?? null,
    }));
  } finally {
    await pool.end();
  }
}

/**
 * A ledger id is `<at>-<6>` (record spec §5). The verb's six characters are
 * random; migrate's are a digest of the row it is transcribing, so the same
 * database produces the same ledger twice and the diff an owner reviews is
 * stable between runs.
 */
export function ledgerIdFor(stableId: string, at: string): string {
  const digest = createHash("sha256").update(`${stableId}\n${at}`).digest("hex").slice(0, 6);
  return `${at}-${digest}`;
}
