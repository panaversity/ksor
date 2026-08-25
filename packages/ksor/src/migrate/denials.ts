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
      scope: readScope(String(row["stable_id"]), row["scope"]),
      reason: String(row["reason"] ?? ""),
      at: (row["created_at"] as Date).toISOString().replace(/\.\d+Z$/, "Z"),
      actor: actorOf.get(String(row["stable_id"])) ?? null,
    }));
  } finally {
    await pool.end();
  }
}

/**
 * The column, read STRICTLY. `x === "subtree" ? "subtree" : "node"` narrowed
 * anything unexpected toward the weaker posture, and node/subtree IS the
 * governance guarantee (decision 14): a subtree denial covers descendants a
 * later change adds, a node denial does not. The schema's CHECK constraint
 * makes the value safe today, which is exactly why the fail-open direction was
 * invisible — the guard was somewhere else, and this line would not go red if
 * it moved. This is a one-time governance transcription: a value it cannot read
 * stops it rather than guessing.
 */
function readScope(stableId: string, value: unknown): "node" | "subtree" {
  const scope = String(value);
  if (scope === "node" || scope === "subtree") return scope;
  throw new Error(
    `ksor-migrate-underivable: the denylist row for \`${stableId}\` has \`scope: ${scope}\`, which is neither \`node\` nor \`subtree\`\n` +
      "  why: node and subtree are different guarantees — a subtree denial covers descendants a later change adds — and transcribing an unreadable value would narrow a takedown silently\n" +
      "  fix: correct the row in the database, then run `ksor migrate` again",
  );
}
