---
"@panaversity/ksor": patch
---

**The embedding dimension ceiling is now held equal in both places it is
declared.**

`EMBED_DIM_MAX` is declared twice — in the instance parser, so a bad `dim:` is
refused when `instance.md` is READ, and in the DDL renderer, so it is refused
again before any schema is rendered. The split is deliberate and the comment
beside one calls it a mirror of the other. Nothing held them equal: before this,
the constant appeared in no test anywhere in the repository, so raising the
ceiling in one place alone would have left the parser and the renderer refusing
at different dimensions with nothing going red.

The test asserts EQUALITY and never the number, so the ceiling can still move —
which is the point, because the decision that records why it sits at 2000 prices
raising it rather than forbidding it.

Also documentation-only, in the same area: the measurement behind the shipped
embedding default — the dimensionality table's flat top, its missing 3072 row,
and the halfvec lead — now lives in exactly one place, beside the constant it
constrains, with its source URL and retrieval date rather than as figures copied
into two files with nothing holding them equal.
