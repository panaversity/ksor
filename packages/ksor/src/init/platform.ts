/** The scaffold's toolchain requires it (decision 5, and `engines` here). */
const MINIMUM_NODE_MAJOR = 24;

/**
 * The remedy for a runtime ksor cannot run on, or null when it can. Pure so
 * the refusal is testable without installing a second Node.
 */
export function unsupportedPlatform(nodeVersion: string): string | null {
  const version = nodeVersion.replace(/^v/, "");
  const major = Number.parseInt(version, 10);
  // An unparseable version is not evidence of an old one: never refuse on it.
  if (Number.isNaN(major) || major >= MINIMUM_NODE_MAJOR) return null;
  return `ksor requires Node >= ${MINIMUM_NODE_MAJOR} — you are on v${version}; install a current Node and re-run.`;
}
