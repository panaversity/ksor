/**
 * One reader for the control files beside the bundle (`.ksor/*.yaml`): the
 * same parser posture as a concept's frontmatter — core schema, one
 * document, unique keys, a mapping at the root — refused under the file's
 * own slug.
 */
import { parseAllDocuments } from "yaml";

import type { Refusal, RefusalSlug } from "./refusal.js";

export type YamlFileResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

export function parseYamlFile(text: string, path: string, slug: RefusalSlug): YamlFileResult {
  const refuse = (why: string): YamlFileResult => ({
    ok: false,
    refusals: [
      {
        slug,
        path,
        why,
        fix: "fix the YAML so the file is one mapping of the keys the spec names",
      },
    ],
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
  return { ok: true, value };
}

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
