// Shared env seam: env maps are passed explicitly (default process.env) — no
// module-level env reads, so postures are decided per call and tests stay pure.
export type Env = Readonly<Record<string, string | undefined>>;

export type WarnLog = (message: string) => void;

export const defaultWarn: WarnLog = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

/**
 * Fail-SOFT numeric tuning knob (ported from sor_platform.env, decision 6). A
 * strict parse at boot turns a fat-fingered env value into a crash before the
 * server binds — a tuning knob must never be able to take serving down. On a
 * malformed value fall back to the default with a WARNING naming the variable;
 * a well-formed value below `minimum` is CLAMPED, not reset — an operator who
 * set a cap low (e.g. during an abuse incident) meant it low, so inverting to
 * the default would defy intent; clamping honors the direction, enforces the
 * floor.
 */
export function envInt(
  env: Env,
  name: string,
  fallback: number,
  options: { minimum?: number; warn?: WarnLog } = {},
): number {
  const warn = options.warn ?? defaultWarn;
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    warn(`env ${name}=${JSON.stringify(raw)} is not an integer — falling back to ${fallback}`);
    return fallback;
  }
  const value = Number(trimmed);
  if (options.minimum !== undefined && value < options.minimum) {
    warn(
      `env ${name}=${value} is below the minimum ${options.minimum} — clamping to ${options.minimum}`,
    );
    return options.minimum;
  }
  return value;
}
