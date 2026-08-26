---
"@panaversity/ksor": patch
---

**A lighter starter, and `refresh` finally says what it does** (issues #173, #171).

`ksor init` put five of `knowledge/`'s eleven files onto a single concept — 199
lines of companions against a 40-line document — so the first thing an adopter
opened was one document wearing four attachments. The flashcards, quiz and
slides companions are gone; `what-is-a-ksor.summary.md` stays, because it is the
only companion carrying a governance rule (exactly `type: Summary`, one key), so
the profile marker is still demonstrated. `knowledge/` goes from 11 files to 8.

What that costs, stated rather than glossed: the recall, quiz and slides tabs are
no longer shown by the starter, and an adopter meets those features in the docs
instead. Nothing about the companion mechanism changed — decision 24 is
untouched, and the migrate fixture that proves a deck migrates byte-identically
is frozen from an older tree, so it still covers the case.

And `pnpm refresh` was a name the constitution never defined, sitting beside
`pnpm ingest` and `ksor ingest` with nothing saying how the three relate. It has
a vocabulary entry now, and `docs/ingesting.md` opens with the model: `ksor
build` makes the SITE correct with no database, `ksor ingest` makes the AGENT
DOOR correct, and `pnpm refresh` runs both. The split between the scaffold's
script and the underlying verb is deliberate, and now it is written down instead
of inferred.
