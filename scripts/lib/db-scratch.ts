/**
 * The grammar of a db-tier scratch database name, in ONE place.
 *
 * Two programs read it — guard rule 12, which requires every `.db.test.ts` to
 * name its scratch database this way, and `scripts/db-reaper.ts`, which drops
 * the ones an interrupted run left behind. A reaper that parses a shape the
 * guard does not enforce would either miss leaks or, far worse, drop a database
 * it cannot prove is ours.
 *
 *     ksor_<slug>_<created-at, base36 ms>_<6 random hex>
 *     ksor_idle_mfr3k9a1_3f2c8e
 *
 * The timestamp is IN THE NAME on purpose. Postgres records no creation time
 * for a database — `pg_database` has no such column, and reading it off the
 * data directory needs `pg_read_server_files`, which a managed Postgres does
 * not grant. Without an age the reaper cannot tell a leak from a database a
 * CONCURRENT run created seconds ago and has not connected to yet, and dropping
 * that is the failure the reaper exists to prevent.
 */

/** Nothing before this could be one of ours; guards against matching an adopter's own name. */
const EPOCH_FLOOR: number = Date.UTC(2020, 0, 1);

export interface ScratchName {
  /** The instant encoded in the name, which is the only age the reaper has. */
  readonly createdAtMs: number;
}

/**
 * Parse a scratch name, or answer `null` for anything that is not certainly one.
 *
 * Deliberately strict in the one direction that matters: a name this refuses is
 * left alone forever, and a name it accepts may be DROPPED. `ksor_` alone is not
 * evidence — an adopter's own database on a shared cluster may well start that
 * way — so acceptance needs the whole shape AND a timestamp that is a plausible
 * instant rather than merely base36.
 */
export function parseScratchName(name: string, now: number = Date.now()): ScratchName | null {
  if (!name.startsWith("ksor_")) return null;
  const parts = name.split("_");
  // ksor + at least one slug part + stamp + random
  if (parts.length < 4) return null;
  const random = parts.at(-1);
  const stamp = parts.at(-2);
  if (random === undefined || stamp === undefined) return null;
  if (!/^[0-9a-f]{6}$/.test(random)) return null;
  if (!/^[0-9a-z]{6,10}$/.test(stamp)) return null;
  const createdAtMs = Number.parseInt(stamp, 36);
  if (!Number.isFinite(createdAtMs)) return null;
  // A clock ahead of ours by a little is ordinary on a shared cluster; a day is
  // not, and a name minted before this project existed is somebody else's.
  if (createdAtMs < EPOCH_FLOOR || createdAtMs > now + 86_400_000) return null;
  return { createdAtMs };
}

/** How long a scratch database must have existed before the reaper will drop it. */
export const REAP_AFTER_MS: number = 3 * 60 * 60 * 1000;
