/**
 * One reader for the control files beside the bundle (`.ksor/*.yaml`): the
 * same parser posture as a concept's frontmatter — one document, unique keys,
 * plain data throughout, a mapping at the root — refused under the file's own
 * slug.
 *
 * Every clause of that posture was re-probed against `yaml` 2.9.0 on
 * 2026-08-25, because the previous wording listed `schema: "core"` among them
 * as though it were a safety property. What the options really buy:
 *
 * - `uniqueKeys` makes a repeated key an ERROR, so a second `takedown_authorities:`
 *   cannot quietly win over the first.
 * - An unknown tag (`!Foo`) is an error, so nothing resolves through a handler
 *   this codebase never wrote.
 * - An alias bomb throws at `toJS()` ("Excessive alias count"), which the
 *   `catch` turns into a refusal rather than a hung process.
 * - `schema: "core"` decides how PLAIN scalars resolve — `.inf` is a number,
 *   `2026-01-01` stays a string — and that is all it decides. It does NOT
 *   refuse the YAML 1.1 type tags: `!!binary` resolves to a Buffer, `!!set` to
 *   a Set and `!!omap` to a Map, with no error and no warning. The root-only
 *   mapping check never looked at a value, so a control file could carry an
 *   object no rule here is written against — `Policy.raw` is published
 *   verbatim — which is why `firstNonPlain` walks the whole document.
 * - `__proto__` needs no defence and gets none: `yaml` assigns through
 *   `Object.defineProperty`, so it lands as an ordinary own key and the global
 *   prototype is untouched. Pinned in the tests, not asserted here.
 */
import { parseAllDocuments } from "yaml";

import type { Refusal, RefusalSlug } from "./refusal";

export type YamlFileResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

const SHAPE_FIX = "fix the YAML so the file is one mapping of the keys the spec names";

export function parseYamlFile(text: string, path: string, slug: RefusalSlug): YamlFileResult {
  const refuse = (why: string, fix: string = SHAPE_FIX): YamlFileResult => ({
    ok: false,
    refusals: [{ slug, path, why, fix }],
  });
  let value: unknown;
  try {
    const docs = parseAllDocuments(text.replace(/^\uFEFF/, ""), {
      schema: "core",
      uniqueKeys: true,
      logLevel: "silent",
    });
    if (docs.length > 1) return refuse("the file holds more than one YAML document");
    const problem = docs[0]?.errors[0] ?? docs[0]?.warnings[0];
    if (problem !== undefined) {
      return refuse(`not valid YAML: ${problem.message.split("\n")[0] ?? ""}`);
    }
    value = docs[0]?.toJS();
  } catch (error) {
    const first = String(error).split("\n")[0] ?? "";
    return refuse(`not valid YAML: ${first.replace(/^\w*Error: /, "")}`);
  }
  if (value === null || value === undefined) value = {};
  if (!isPlainMapping(value)) return refuse("the file is not a mapping at its root");
  const tagged = firstNonPlain(value, "");
  if (tagged !== null) {
    return refuse(
      `the value at \`${tagged}\` is not plain data — a \`!!tag\` turned it into something no reader expects`,
      "write strings, numbers, booleans, lists and mappings only; timestamps stay quoted strings",
    );
  }
  return { ok: true, value };
}

export function isPlainMapping(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Path of the first value that is neither a scalar, an array nor a plain
 * mapping — `null` when all are. One walk, shared with `splitFrontmatter`: the
 * frontmatter reader grew it first, and a control file that decides authority
 * and denial is the last place to enforce a weaker rule than a document's own
 * header does.
 */
export function firstNonPlain(value: unknown, at: string): string | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return null;
  }
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const hit = firstNonPlain(item, `${at}[${i}]`);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!isPlainMapping(value)) return at === "" ? "(root)" : at;
  for (const [key, item] of Object.entries(value)) {
    const hit = firstNonPlain(item, at === "" ? key : `${at}.${key}`);
    if (hit !== null) return hit;
  }
  return null;
}
