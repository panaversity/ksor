/**
 * The search index must not pin a tokenizer language.
 *
 * The engine's default is `multilingual`, which segments with `Intl.Segmenter`
 * and indexes every script. Naming a language selects a per-language splitter
 * regex instead, and `english`'s is Latin-only — so an Urdu or Chinese document
 * indexed under it produces ZERO tokens and cannot be found, while its page
 * still renders, still sits in the sidebar and still appears in llms.txt.
 * Nothing goes red. That is the "silent weakness" the record's invariants
 * forbid, and it broke the product's own claim to hold "plain markdown, in any
 * language they write in" for every non-Latin record.
 *
 * This asserts the SHIPPED BYTES, which is what a regression would look like:
 * the option is re-added for a perceived English win it does not buy (since
 * fumadocs-core 16.14.0 the engine is ZBSearch, which disables stemming and
 * ships empty stopwords by default, so `english` and `multilingual` return
 * identical results on English text).
 *
 * What it deliberately does NOT claim: that a non-Latin document is findable.
 * That is a behavioural fact about the built index and belongs in the
 * KSOR_E2E tier, which installs the real tree — see scaffold-e2e.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROUTE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "scaffold",
  "system",
  "site",
  "app",
  "api",
  "search",
  "route.ts",
);

describe("the scaffolded search index", () => {
  const source = readFileSync(ROUTE, "utf8");

  it("names no tokenizer language, so every script indexes", () => {
    // Matches `language:` as an option key only — the word appears in this
    // file's own explanation of why the option is absent, and that prose must
    // not be what keeps the test green.
    const pinned = /^\s*language\s*:/m.exec(source);
    expect(
      pinned?.[0] ?? null,
      "a named language selects a per-script splitter: a Latin-only one indexes " +
        "an Urdu or Chinese document to zero tokens, silently. Leave the engine " +
        "on its `multilingual` default.",
    ).toBeNull();
  });

  it("still exports the static index the dialog downloads", () => {
    // The option was removed, not the route: `staticGET` is what prerenders the
    // JSON the client-side dialog fetches, and dropping it would take search out
    // of a static export entirely.
    expect(source).toMatch(/staticGET:\s*GET/);
    expect(source).toMatch(/createFromSource\(\s*source\s*\)/);
  });
});
