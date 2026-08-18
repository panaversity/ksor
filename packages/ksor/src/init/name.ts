/** Project-name grammar (spec: `^[a-z0-9][a-z0-9-]{0,62}$`). */
export const NAME_GRAMMAR = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidName(name: string): boolean {
  return NAME_GRAMMAR.test(name);
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
  return isValidName(slug) ? slug : null;
}
