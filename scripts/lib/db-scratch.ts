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

/**
 * Evaluate a scratch-name EXPRESSION, as a suite wrote it, into one concrete
 * name — so guard rule 12 can hand the reaper the name a suite will actually
 * mint rather than a literal the guard invented for itself.
 *
 * Two shapes are read, the two the tier uses:
 *
 *     `ksor_idle_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`
 *     ["ksor", slug, Date.now().toString(36), randomBytes(3).toString("hex")].join("_")
 *
 * Only the two governed fields are evaluated for real: a `Date.now()` stamp
 * becomes `now` in base36 (an offset such as `Date.now() - agoMs` is the
 * fixture's business, not the grammar's), and `randomBytes(n)` becomes 2n hex
 * characters — which is the point, because `randomBytes(2)` passes a text
 * check that looks for `randomBytes(` and mints a name the reaper refuses.
 * Anything else — a slug variable, an index — stands in as `x`: it can only
 * lengthen the slug, and the parser reads the governed fields from the right.
 *
 * Answers `null` for an expression that is neither shape, so the caller can
 * say "unreadable" apart from "reads as a name the reaper would not drop".
 */
export function sampleScratchName(expression: string, now: number = Date.now()): string | null {
  const source = expression.trim();
  if (source.length >= 2 && source.startsWith("`") && source.endsWith("`")) {
    return source
      .slice(1, -1)
      .replace(/\$\{([^}]*)\}/g, (_, inner: string) => evaluatePart(inner, now));
  }
  const join = /^\[([\s\S]*)\]\s*\.join\(\s*"_"\s*\)$/.exec(source);
  if (join !== null) {
    return splitTopLevel(join[1] ?? "")
      .map((part) => evaluatePart(part, now))
      .join("_");
  }
  return null;
}

function evaluatePart(part: string, now: number): string {
  const text = part.trim();
  const quoted = /^(["'])(.*)\1$/.exec(text);
  if (quoted !== null) return quoted[2] ?? "";
  if (text.includes("Date.now()") && text.includes(".toString(36)")) return now.toString(36);
  const random = /^randomBytes\(\s*(\d+)\s*\)\.toString\(\s*"hex"\s*\)$/.exec(text);
  if (random !== null) {
    const bytes = Number.parseInt(random[1] ?? "0", 10);
    return Array.from({ length: bytes * 2 }, (_, i) => "0123456789abcdef"[i % 16]).join("");
  }
  return "x";
}

/** Split array-literal elements on the commas that are not inside a call or a string. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of list) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
}
