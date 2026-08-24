/**
 * Split a document into its YAML frontmatter and its body — with a real YAML
 * parser. The five line scanners this replaces (research/okf-native.md §1)
 * could not read a nested `ksor:` block and failed silently on it.
 */
import { parse, YAMLParseError } from "yaml";

import type { Refusal } from "./refusal.js";

export type Split =
  | {
      readonly ok: true;
      readonly frontmatter: Readonly<Record<string, unknown>> | null;
      readonly body: string;
    }
  | { readonly ok: false; readonly refusal: Refusal };

const SLUG = "ksor-frontmatter-invalid";

/** An editor's byte-order mark is invisible to the author; CRLF is the checkout's, not the record's. */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replaceAll("\r\n", "\n");
}

/**
 * `frontmatter` is null when the text has no fence at all, `{}` for an empty
 * block. The body is everything after the closing fence's newline, byte-exact.
 */
export function splitFrontmatter(text: string, path: string): Split {
  const normalized = normalizeText(text);
  if (!normalized.startsWith("---\n")) {
    return { ok: true, frontmatter: null, body: normalized };
  }
  const rest = normalized.slice(4);
  const close = /^---[ \t]*$/m.exec(rest);
  if (close === null) {
    return refuse(
      path,
      "the frontmatter opens with `---` but no closing `---` line follows",
      "add a `---` line after the last frontmatter key",
    );
  }
  const block = rest.slice(0, close.index);
  const afterFence = close.index + close[0].length;
  const body = rest.slice(afterFence).replace(/^\n/, "");

  let value: unknown;
  try {
    value = parse(block, { schema: "core", uniqueKeys: true });
  } catch (error) {
    const reason = error instanceof YAMLParseError ? error.message.split("\n")[0] : String(error);
    return refuse(
      path,
      `the frontmatter is not valid YAML: ${reason}`,
      "fix the YAML — a stray colon, an unclosed bracket, a duplicated key, or tab indentation are the usual causes",
    );
  }
  if (value === null || value === undefined) return { ok: true, frontmatter: {}, body };
  if (typeof value !== "object" || Array.isArray(value)) {
    return refuse(
      path,
      "the frontmatter is not a mapping (a list or a bare scalar was found)",
      "write `key: value` pairs between the fences",
    );
  }
  return { ok: true, frontmatter: value as Record<string, unknown>, body };
}

function refuse(path: string, why: string, fix: string): Split {
  return { ok: false, refusal: { slug: SLUG, path, why, fix } };
}
