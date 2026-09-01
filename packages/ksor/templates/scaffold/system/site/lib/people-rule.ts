/**
 * What a phone book file DECLARES, as a pure function of its text.
 *
 * A LEAF, like `actor-display.ts`: `people.ts` roots itself at the project via
 * `shared.ts`, which reads `instance.md` at module load, so a rule living
 * there could only be exercised by building a whole record on disk first. That
 * is a test nobody writes, and the duplicate-key rule below went four days
 * asserted only by a comment because of it.
 *
 * A map comes back for every malformed shape rather than an error, because a
 * phone book is DECORATION: a record with an unreadable one publishes
 * identifiers, which is exactly what it did before the file existed.
 */

import { parseAllDocuments } from "yaml";

/**
 * The phone book a file DECLARES, as a pure function of its text.
 *
 * Separated from the read so the rule can be exercised without a record on
 * disk: the loader below is a filesystem act rooted at `projectRoot`, and a
 * test that has to build a whole scaffold to ask "what do two entries for one
 * actor mean?" is a test nobody writes. A map is handed back for every
 * malformed shape rather than an error, because a phone book is decoration:
 * a record with an unreadable one publishes identifiers, which is what it did
 * before the file existed.
 */
export function parsePeople(text: string): ReadonlyMap<string, string> {
  try {
    const docs = parseAllDocuments(text.replace(/^\ufeff/, ""), {
      schema: "core",
      uniqueKeys: true,
      logLevel: "silent",
    });
    const doc = docs[0];
    if (doc === undefined) return new Map();
    // `uniqueKeys: true` RECORDS a duplicate rather than refusing one — `toJS()`
    // still resolves last-wins. Reading the option and not the errors is what
    // made the claim above false: two entries for one actor silently published
    // the second person's name on the first person's governance act.
    if (doc.errors.length > 0) return new Map();
    const value: unknown = doc.toJS();
    if (typeof value !== "object" || value === null) return new Map();
    const table = (value as { people?: unknown }).people;
    if (typeof table !== "object" || table === null || Array.isArray(table)) return new Map();
    const out = new Map<string, string>();
    for (const [actor, name] of Object.entries(table as Record<string, unknown>)) {
      // A blank value is an entry someone started and left; printing "" would
      // erase the identifier rather than replace it.
      if (typeof name === "string" && name.trim() !== "") out.set(actor.trim(), name.trim());
    }
    return out;
  } catch {
    return new Map();
  }
}
