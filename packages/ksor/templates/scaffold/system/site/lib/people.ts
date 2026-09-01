/**
 * Natural names for the actors this record cites — the site's phone book.
 *
 * A MAP keyed by the actor as stored (`human:bashiraziz`, `team:legal-ops`),
 * not a list of names a handle is derived from. The derivation was the defect:
 * `name.replace(/\s+/g, "").toLowerCase()` can only ever match a handle that
 * IS somebody's squashed full name, so `human:ciso`, `human:audit-lead` and
 * `human:mjs` — most of the actors in a real record — had no expressible name
 * at all. It also collided: "Bashir Aziz" and "Bashira Ziz" both derive
 * `bashiraziz`, which would print one person's name on the other's governance
 * act. A map has neither problem, and a duplicate key drops the whole book
 * rather than resolving to whichever came last — `uniqueKeys` only REPORTS the
 * duplicate, so the errors have to be read for that to be true.
 *
 * ONE-WAY. The identifier is what the record stores, cites and checks against
 * the policy; this is only what a page prints. Nothing reads a name back into
 * an actor, and no authority follows from appearing here — which is why this is
 * a file of its own and not a block in `.ksor/governance.yaml`: that file is
 * the root of authority, its key set is closed on purpose, and its digest is
 * hashed into `build.lock.json`, so correcting the spelling of someone's name
 * there would refuse the next site build as `ksor-lock-stale`.
 *
 * Read from the project root rather than the process's cwd: `next build` runs
 * in `system/site`, so a cwd-relative path found nothing and the feature was
 * inert in exactly the builds that publish.
 *
 * Read AT USE and memoised, not at module load. A module-load `readFileSync`
 * makes importing this module a filesystem act — it runs wherever the module is
 * pulled in, including from a test that wants nothing but the display rule, and
 * it fixes the answer before anything has had a chance to say where the record
 * is. That is the same defect the env-tuning knobs had (#149/#194), one file
 * over.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { parsePeople } from "./people-rule";
import { projectRoot } from "./shared";

const PEOPLE_YAML = path.join(projectRoot, ".ksor", "people.yaml");

function loadPeople(): ReadonlyMap<string, string> {
  let text: string;
  try {
    text = readFileSync(PEOPLE_YAML, "utf8");
  } catch {
    // Optional: its absence means "no natural names declared".
    return new Map();
  }
  return parsePeople(text);
}

let cached: ReadonlyMap<string, string> | null = null;

/**
 * What this record has declared. Memoised per process: the file is authored,
 * not runtime state, and a static build renders many pages from one read.
 */
export function peopleBook(): ReadonlyMap<string, string> {
  cached ??= loadPeople();
  return cached;
}
