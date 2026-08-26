/**
 * What migrate may WRITE into a governance file as an actor.
 *
 * `isIndividualActor` (the record module) matches `^(human|process|team):(\S+)$`
 * — an id of any non-whitespace characters at all. That is the right rule for
 * READING a record someone else already wrote, and the wrong one for deciding
 * what this tool may author: `\S+` admits `]`, `,`, `#`, quotes, `*`, `&`,
 * U+2028 and 10 kB of anything, every one of which is either a YAML indicator
 * or not an identity. A governance identity carrying a bracket is not a thing
 * anyone should be able to record (decision 21: a governance act NAMES its
 * actor), so the narrowing happens at every seam a string enters migrate by —
 * `--actor`, `--approve-by`, `--attribute`, and `retrieval_log.actor` read
 * from the database, which no argument guard could ever cover.
 *
 * This is DELIBERATELY stricter than the record's reader: everything it admits,
 * `isIndividualActor` admits too (asserted in `actor.test.ts`), so migrate can
 * never write an actor the checker would then refuse. The reverse would be the
 * bug.
 */
import { actorKind } from "@panaversity/ksor-content/record";

/**
 * `human:` or `process:` and an id of ascii letters, digits and the four
 * separators real handles use — `j.smith`, `audit-lead`, `kliu@example.com`,
 * `nightly+finance`. `team:` is excluded here as it is in `isIndividualActor`:
 * these slots name an individual.
 */
const PREFIXED = /^(?:human|process):[A-Za-z0-9][A-Za-z0-9._+@-]*$/;

/**
 * Long enough for an email-shaped handle and far short of anything that is a
 * payload rather than a name. A single ledger row carries this string, so an
 * unbounded one is unbounded in the file too.
 */
const MAX = 128;

// Deliberately NOT a `value is string` type guard: every caller already holds
// a string, and a guard would narrow the FALSE branch to `never` — so the
// refusal that quotes the offending value back could not read it.
export function isWritableActor(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX) return false;
  // The producer form (`<name>/<version>`) is already a tight grammar in the
  // record module — no indicator characters reach it — so it is taken as it is.
  return PREFIXED.test(value) || actorKind(value) === "producer";
}

/** The one sentence every seam prints, so the operator reads the same rule wherever they hit it. */
export const ACTOR_FORM =
  "an actor is `human:<id>`, `process:<id>` or `<producer>/<version>`, where `<id>` is ascii letters, digits and `. _ + @ -`";
