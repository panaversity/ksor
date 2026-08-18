/**
 * Fail-SOFT env knobs (oracle SP/env.py): a tuning variable must never keep
 * the process from binding its port. Unset/blank/malformed (and non-finite
 * float) fall back to the default with a warning naming the variable; a
 * well-formed value below `minimum` is CLAMPED to the minimum, not reset —
 * clamping honors operator intent, resetting punishes a typo twice.
 */

function warn(name: string, raw: string, fallback: number): void {
  console.warn(`env ${name}=${JSON.stringify(raw)} is not a number; using default ${fallback}`);
}

export function envInt(name: string, fallback: number, minimum?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(value)) {
    warn(name, raw, fallback);
    return fallback;
  }
  if (minimum !== undefined && value < minimum) return minimum;
  return value;
}

export function envFloat(name: string, fallback: number, minimum?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseFloat(raw.trim());
  if (!Number.isFinite(value)) {
    warn(name, raw, fallback);
    return fallback;
  }
  if (minimum !== undefined && value < minimum) return minimum;
  return value;
}
