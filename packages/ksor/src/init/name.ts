/** Project-name grammar (spec: `^[a-z0-9][a-z0-9-]{0,62}$`). */
export const NAME_GRAMMAR: RegExp = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Windows refuses these as directory names at the filesystem layer, whatever
 * the grammar says — and the spec runs its acceptance on windows-latest, so a
 * name accepted here must be a directory everywhere.
 */
const WINDOWS_RESERVED: ReadonlySet<string> = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/** Why a name is unusable — the refusal must not blame the wrong rule. */
export type NameProblem = "grammar" | "windows-reserved";

export function nameProblem(name: string): NameProblem | null {
  if (!NAME_GRAMMAR.test(name)) return "grammar";
  if (WINDOWS_RESERVED.has(name)) return "windows-reserved";
  return null;
}

export function isValidName(name: string): boolean {
  return nameProblem(name) === null;
}

/** A best-effort valid slug from an invalid name, for the remedy line. */
export function suggestName(input: string): string | null {
  const slug = input
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 63);
  // A remedy that names an unusable directory is a lying error, so a reserved
  // slug is widened rather than offered.
  const usable = WINDOWS_RESERVED.has(slug) ? `${slug}-sor` : slug;
  return isValidName(usable) ? usable : null;
}
