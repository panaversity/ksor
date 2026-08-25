/**
 * Split a document into its YAML frontmatter and its body — with a real YAML
 * parser. The line scanners it will replace (research/okf-native.md §1) could
 * not read a nested `ksor:` block and failed silently on it.
 */
import { parseAllDocuments, YAMLParseError } from "yaml";

import type { Refusal } from "./refusal";
import { firstNonPlain, isPlainMapping } from "./yaml-file";

export type Split =
  | {
      readonly ok: true;
      readonly frontmatter: Readonly<Record<string, unknown>> | null;
      /** The YAML between the fences, byte-exact and comments intact — what `ksor migrate` rewrites. */
      readonly block: string;
      readonly body: string;
    }
  | { readonly ok: false; readonly refusal: Refusal };

const SLUG = "ksor-frontmatter-invalid";
/** A fence line: three dashes, trailing blanks tolerated, on the opening and the closing line alike. */
const FENCE = /^---[ \t]*$/;

/** An editor's byte-order mark is invisible to the author; CR and CRLF are the checkout's, not the record's. */
export function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/**
 * `frontmatter` is null when the text has no fence at all, `{}` for an empty
 * block. The body is everything after the closing fence's newline, byte-exact.
 *
 * The block ends at the first fence LINE after the opening one — found by
 * walking real `\n` boundaries, never a multiline regex, because JS `^`/`$`
 * also break on U+2028/U+2029 and YAML 1.2 does not (found in review: a scalar
 * containing U+2028 was cut mid-line and the real fence published as body).
 * The consequence is a rule of the profile: a frontmatter may not contain a
 * bare `---` line, block scalars included (record spec §2).
 */
export function splitFrontmatter(text: string, path: string): Split {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  if (!FENCE.test(lines[0] ?? "")) {
    return { ok: true, frontmatter: null, block: "", body: normalized };
  }
  const closeAt = lines.findIndex((line, i) => i > 0 && FENCE.test(line));
  if (closeAt === -1) {
    return refuse(
      path,
      "the frontmatter opens with `---` but no closing `---` line follows",
      "add a `---` line after the last frontmatter key",
    );
  }
  const block = lines.slice(1, closeAt).join("\n");
  const body = lines.slice(closeAt + 1).join("\n");

  let value: unknown;
  try {
    const docs = parseAllDocuments(block, {
      schema: "core",
      uniqueKeys: true,
      logLevel: "silent",
    });
    if (docs.length > 1) {
      return refuse(
        path,
        "the frontmatter is not valid YAML: a second document marker (`---` or `...`) sits inside the block",
        "one document per frontmatter — remove the marker",
      );
    }
    const doc = docs[0];
    const problem = doc?.errors[0] ?? doc?.warnings[0];
    if (problem !== undefined) throw problem;
    value = doc?.toJS();
  } catch (error) {
    return refuse(
      path,
      `the frontmatter is not valid YAML: ${reasonOf(error)}`,
      "fix the YAML — a stray colon, an unclosed bracket, a duplicated key, tab indentation or an unknown `!!tag` are the usual causes",
    );
  }
  if (value === null || value === undefined) return { ok: true, frontmatter: {}, block, body };
  if (!isPlainMapping(value)) {
    return refuse(
      path,
      "the frontmatter is not a mapping (a list or a bare scalar was found)",
      "write `key: value` pairs between the fences",
    );
  }
  const tagged = firstNonPlain(value, "");
  if (tagged !== null) {
    return refuse(
      path,
      `the frontmatter value at \`${tagged}\` is not plain data — a \`!!tag\` turned it into something no reader expects`,
      "write strings, numbers, booleans, lists and mappings only; timestamps stay quoted strings",
    );
  }
  return { ok: true, frontmatter: value, block, body };
}

/** The message as an author reads it: the first line, minus any `SomeError:` class prefix. */
function reasonOf(error: unknown): string {
  const first = error instanceof YAMLParseError ? error.message : String(error);
  return first.split("\n")[0]?.replace(/^\w*Error: /, "") ?? "unreadable";
}

function refuse(path: string, why: string, fix: string): Split {
  return { ok: false, refusal: { slug: SLUG, path, why, fix } };
}

/**
 * The document's frontmatter as the file holds it — the bytes between the
 * fences, unparsed — or null when it has none or an unclosed one.
 *
 * The markdown twin serves this INTACT rather than a re-serialisation of the
 * parsed object, and so does the door's `read` tool: the profile preserves
 * unknown keys (record spec §2.6), and anything this codebase re-emits can
 * only carry the keys it thought of. It
 * reads the block `splitFrontmatter` already found, so there is exactly one
 * walk deciding where a fence ends — a second one that disagreed would
 * publish a different document from the one the checker read.
 */
export function frontmatterText(text: string): string | null {
  const split = splitFrontmatter(text, "(twin)");
  if (!split.ok || split.frontmatter === null) return null;
  return split.block;
}
