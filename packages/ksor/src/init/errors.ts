/** The `code` of a Node system error, or null for anything that carries none. */
export function errnoCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const { code } = value as { code?: unknown };
  return typeof code === "string" ? code : null;
}

/**
 * Failures the environment caused and the environment must fix — exit 3. Any
 * other throw is a ksor bug and keeps its stack rather than being dressed up
 * as the operator's fault.
 */
const ENVIRONMENT_CODES: ReadonlySet<string> = new Set([
  "EACCES",
  "EAGAIN",
  "EBUSY",
  "EDQUOT",
  "EEXIST",
  "EIO",
  "EISDIR",
  "ELOOP",
  "EMFILE",
  "ENAMETOOLONG",
  "ENFILE",
  "ENOENT",
  "ENOSPC",
  "ENOTDIR",
  "ENOTEMPTY",
  "EPERM",
  "EROFS",
  "EXDEV",
]);

export function isEnvironmentError(value: unknown): boolean {
  const code = errnoCode(value);
  return code !== null && ENVIRONMENT_CODES.has(code);
}
