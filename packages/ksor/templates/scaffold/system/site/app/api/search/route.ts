import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Static export: this route is prerendered into a JSON index file that the
// search dialog downloads and queries client-side (see app/layout.tsx).
export const revalidate = false;

// NO `language:` option, deliberately. The engine's own default is
// `multilingual`, which segments with `Intl.Segmenter` and indexes every script;
// naming a language selects a per-language splitter regex instead. `english`'s
// is Latin-only, so an Urdu or Chinese document indexed under it produces ZERO
// tokens and is unreachable by search — while its page still renders, still sits
// in the sidebar and still appears in llms.txt. Nothing goes red. That silently
// broke the record's own claim to hold "plain markdown, in any language they
// write in" (found by reading the shipped tokenizer, 2026-08-24).
//
// It bought nothing in exchange: since fumadocs-core 16.14.0 the engine is
// ZBSearch, which disables stemming and ships empty stopwords by default, so
// `english` and `multilingual` return identical results on English text.
// Restoring stemming is a separate, larger decision — it needs a stemmer
// dependency AND the same tokenizer handed to the browser through `initDB`.
export const { staticGET: GET } = createFromSource(source);
