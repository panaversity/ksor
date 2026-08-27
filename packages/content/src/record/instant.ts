/**
 * Every timestamp in the record is an ISO 8601 instant with an explicit
 * offset (record spec §2.3; upstream OKF made the same move at the pinned
 * commit). A bare date has no instant to compare, and `Date.parse` would
 * silently supply one in the checker's own time zone.
 *
 * The format is half the rule. `Date.parse` does not refuse a day the calendar
 * does not have — it ROLLS it, so `2026-02-30T00:00Z` is accepted as
 * `2026-03-02T00:00:00Z` and `T24:00` as the next day. A governance timestamp
 * decides WHEN a document is in force, so an `effective_from` that means a date
 * nobody wrote is the same silent substitution the offset rule exists to
 * prevent, reached through the value instead of the format (2026-08-25 review).
 */
const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Epoch milliseconds, or null when the value is not an instant with an offset. */
export function parseInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const fields = INSTANT.exec(value);
  if (fields === null) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return rolled(fields) ? null : ms;
}

/**
 * Did `Date.parse` move any field the author wrote? Asked by re-reading the
 * date and time of day AT UTC — the offset cannot make a date legal or
 * illegal, and reading them as UTC is the one way to render them back without
 * a second calendar implementation of our own.
 *
 * The fraction is deliberately outside the comparison: it can only truncate
 * (`Date.parse` drops precision below a millisecond), never carry into the
 * second, so it changes no field and refusing it would refuse the six-digit
 * form most languages' `isoformat()` emits.
 */
function rolled(fields: RegExpExecArray): boolean {
  const [, year, month, day, hour, minute, second = "00"] = fields;
  const wrote = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const utc = Date.parse(`${wrote}Z`);
  return Number.isNaN(utc) || new Date(utc).toISOString().slice(0, wrote.length) !== wrote;
}
