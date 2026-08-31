/**
 * Turn a stored actor identifier into the string the page prints.
 *
 * KSoR stores actors as `human:<handle>`, `process:<id>`, `team:<id>` or
 * `<producer>/<version>`. Those forms are right for machines — the checker
 * parses them, `.ksor/governance.yaml` lists actors by them, and the whole
 * authority model depends on them — but a public-facing page shouldn't lead
 * with a slug. This module bridges the two.
 *
 * ONE-WAY RULE. If `.ksor/people.yaml` maps this exact identifier to a name, we
 * print `Human: Bashir Aziz`. If it does not, we print the identifier unchanged
 * (`human:bashiraziz`, `ksor-starter/0.0.47`). No convention-based splitting,
 * no camelCase / kebab-case guessing, and no derivation of a handle from a
 * name: an owner is the only source of a display name.
 *
 * A producer actor (`<producer>/<version>`) has no `<kind>:` prefix and no
 * natural name to look up, so it passes through unchanged — which is correct:
 * a tool that approved a document should be named plainly, not humanised.
 *
 * NO IMPORTS: a leaf, like `lifecycle-rule.ts`. The phone book is handed in by
 * the caller rather than reached for, so the rule can be exercised without a
 * record on disk — and so nothing pulls a filesystem read in behind it.
 */

/** The prefixes KSoR's actor grammar defines, in the case the site prints. */
const KIND_LABELS: Record<string, string> = {
  human: "Human",
  process: "Process",
  team: "Team",
};

/**
 * The display form of an actor. An actor that does not appear in
 * `.ksor/people.yaml` renders exactly as stored, so nothing regresses on a
 * record that has declared no names — which is every record until an owner
 * says otherwise.
 */
export function displayActor(actor: string, people: ReadonlyMap<string, string>): string {
  const colonAt = actor.indexOf(":");
  if (colonAt === -1) {
    // No `<kind>:` prefix — this is a producer like `ksor-starter/0.0.47`.
    // Print it unchanged: humanising a tool's identifier would misread.
    return actor;
  }
  // Looked up by the WHOLE identifier, not the bare handle: `human:ops` and
  // `team:ops` are different actors, and a phone book keyed on `ops` would
  // print one of them under the other's name.
  const name = people.get(actor) ?? null;
  if (name === null) return actor;
  const kind = actor.slice(0, colonAt);
  const kindLabel = KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${kindLabel}: ${name}`;
}
