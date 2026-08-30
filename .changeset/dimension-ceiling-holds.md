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
at different dimensions — one of the two would still have reddened an existing
wording assertion, and an instance-only edit would have passed everything.

The test asserts EQUALITY and never the number, so the ceiling can still move —
which is the point, because the decision that records why it sits at 2000 prices
raising it rather than forbidding it.

Also in the same area: the emitted `AGENTS.md` carried the benchmark figures
behind that default with no source and no date, shipped to every adopter. It
states the constraint an adopter acts on and points at the decision that holds
the numbers, so the measurement now lives beside the constant it constrains,
with its provenance, in one place.
