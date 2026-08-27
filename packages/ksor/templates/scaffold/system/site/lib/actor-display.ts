/**
 * Turn a stored actor identifier into the string the page prints.
 *
 * KSoR stores actors as `human:<handle>`, `process:<id>`, `team:<id>` or
 * `<producer>/<version>`. Those forms are right for machines — the checker
 * parses them, `.ksor/governance.yaml` lists actors by them, and the whole
 * authority model depends on them — but a public-facing page shouldn't lead
 * with a slug. This module bridges the two.
 *
 * ONE-WAY RULE. If `.ksor/people.yaml` declares a natural name whose derived
 * handle matches, we print `Human: Bashir Aziz`. If it doesn't, we print the
 * raw identifier unchanged (`human:bashiraziz`, `ksor-starter/0.0.47`). No
 * convention-based splitting, no camelCase / kebab-case guessing: an owner is
 * the only source of a display name, and the tooling asks for one at the next
 * governance moment when a handle has no entry.
 *
 * A producer actor (`<producer>/<version>`) has no `<kind>:` prefix and no
 * natural name to look up, so it passes through unchanged — which is correct:
 * a tool that approved a document should be named plainly, not humanised.
 */

import { naturalize } from "@/lib/people";

/** The prefixes KSoR's actor grammar defines, in the case the site prints. */
const KIND_LABELS: Record<string, string> = {
  human: "Human",
  process: "Process",
  team: "Team",
};

/**
 * The display form of an actor. Handles that don't appear in
 * `.ksor/people.yaml` render exactly as stored, so nothing regresses on a
 * record that hasn't declared any names.
 */
export function displayActor(actor: string): string {
  const colonAt = actor.indexOf(":");
  if (colonAt === -1) {
    // No `<kind>:` prefix — this is a producer like `ksor-starter/0.0.47`.
    // Print it unchanged: humanising a tool's identifier would misread.
    return actor;
  }
  const kind = actor.slice(0, colonAt);
  const handle = actor.slice(colonAt + 1);
  const kindLabel = KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
  const name = naturalize(handle);
  return name === null ? actor : `${kindLabel}: ${name}`;
}
