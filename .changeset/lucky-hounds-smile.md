---
"@panaversity/ksor": patch
---

Search the record in the language it is written in.

The scaffolded site pinned its search index to English tokenization. That is a
per-language splitter regex, and English's is Latin-only — so an Urdu, Chinese,
Japanese or Korean document indexed to **zero tokens** and could not be found,
while its page still rendered, still appeared in the sidebar, and still appeared
in `llms.txt`. Nothing went red. A record written in a non-Latin script was
published complete and silently unsearchable, which broke ksor's own claim to
hold "plain markdown, in any language you write in".

The pin bought nothing in exchange. Since fumadocs-core 16.14.0 the engine is
ZBSearch, which disables stemming and installs empty stopwords by default, so
`english` and `multilingual` return identical results on English text —
including the same miss (`recordings` does not find `recording`) under both.

The option is removed, so the engine keeps its own `multilingual` default and
segments every script. Existing English records are unaffected apart from a
small index-size change: the multilingual segmenter splits hyphenated
identifiers that the English splitter kept whole, which grows the exported index
by roughly 2% on a technical corpus.

Restoring stemming for any language remains available and is a separate,
deliberate change — it needs a stemmer dependency and the same tokenizer handed
to the browser, not a one-word option.
