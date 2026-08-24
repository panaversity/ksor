/**
 * Every timestamp in the record is an ISO 8601 instant with an explicit
 * offset (record spec §2.3; upstream OKF made the same move at the pinned
 * commit). A bare date has no instant to compare, and `Date.parse` would
 * silently supply one in the checker's own time zone.
 */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Epoch milliseconds, or null when the value is not an instant with an offset. */
export function parseInstant(value: unknown): number | null {
  if (typeof value !== "string" || !INSTANT.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
