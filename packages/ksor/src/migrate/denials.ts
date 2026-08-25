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
import { contentPool, runAuditRead, runRead } from "@panaversity/ksor-content";

/**
 * The identity the rows are scoped by, supplied by the CALLER.
 *
 * It is not read from `instance.md` here, and that is the whole point: the
 * instance migrate is looking at is by definition NOT yet in the profile, and
 * the kernel's reader accepts format 2 only. Reading it through that reader
 * made `ksor migrate` refuse every record that had ever climbed to the served
 * rung — the exact population with denylist rows to transcribe — before a
 * single query ran. Migrate derives the identity from the pre-profile
 * frontmatter it is already rewriting (`name:`, which is `tenant_id` and
 * `corpus_id` both, in format 1 as in format 2).
 */
export interface DenialIdentity {
  readonly tenantId: string;
  readonly corpusId: string;
}

/** A refusal raised while transcribing, carried whole so it is never nested inside another one's `why:`. */
export class DenialReadError extends Error {
  readonly why: string;
  readonly fix: string;
  constructor(why: string, fix: string) {
    super(why);
    this.name = "DenialReadError";
    this.why = why;
    this.fix = fix;
  }
}

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
  identity: DenialIdentity,
  dsn: string,
): Promise<readonly DbDenial[]> {
  const pool = contentPool(dsn);
  try {
    const rows = await runRead(pool, identity.tenantId, async (client) => {
      const r = await client.query(
        "SELECT stable_id, scope, reason, created_at FROM takedown_denylist" +
          " WHERE tenant_id = $1 AND corpus_id = $2 ORDER BY created_at, stable_id",
        [identity.tenantId, identity.corpusId],
      );
      return r.rows as Record<string, unknown>[];
    });
    // The audit role reads the provenance trail (schema 2.3); `detail` carries
    // the stable_id the act named.
    const log = await runAuditRead(pool, identity.tenantId, async (client) => {
      const r = await client.query(
        "SELECT actor, detail, created_at FROM retrieval_log" +
          " WHERE tenant_id = $1 AND corpus_id = $2 AND action = 'takedown_applied'" +
          " ORDER BY created_at ASC, id ASC",
        [identity.tenantId, identity.corpusId],
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
  throw new DenialReadError(
    `the denylist row for \`${stableId}\` has \`scope: ${scope}\`, which is neither \`node\` nor \`subtree\` — node and subtree are different guarantees (a subtree denial covers descendants a later change adds), and transcribing an unreadable value would narrow a takedown silently`,
    "correct the row in the database, then run `ksor migrate` again",
  );
}
