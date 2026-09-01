---
"@panaversity/ksor": patch
---

Stop a spent OpenAI balance from quarantining content and flipping a generation,
and name the right variable when a provider key is missing.

**The serious one.** `insufficient_quota` — OpenAI's answer to an exhausted
balance, which arrives as 429 like an ordinary rate limit — was classified
non-retryable, correctly, because no amount of waiting adds credit. But
"non-retryable" is what the ingest drain reads as **poison chunk**: it
binary-splits the batch down to singletons and marks each `failed`. A spent
balance arrives on _every_ chunk, so a run walked the queue quarantining
everything it touched; if the failed fraction stayed under
`MAX_FAILED_FRACTION` (2%), `generationReady` admitted it and the generation
**flipped** — publishing a record in which exactly the passages the owner had
just edited were unsearchable, `ksor ingest` exit 0, the billing reason visible
only in `chunks.embed_error`. The same event on Gemini aborts the run, so
switching provider silently changed what a spent quota does.

The drain now has three answers instead of two: retryable (abort, chunks stay
pending), **fatal** (abort the same way, but without spending five backoffs
first — the account is what is wrong, not the passage), and everything else
(binary-split to the poison chunk). `isFatal` is optional on `EmbeddingProvider`,
so a provider that cannot tell keeps the old two-kind behaviour and Gemini's
path is unchanged.

**The missing-key refusal names the variable.** `ksor serve` on an
`embedding.provider: openai` record said `embedding provider "openai" needs an
API key and none was supplied` and stopped — while `ksor serve --help`,
`env.example` and `docs/deploying.md` all named `GEMINI_API_KEY`, which that
door does not read. The registry row already held `keyEnv`; it now reaches the
operator (`— set OPENAI_API_KEY`), and all three documents describe the choice
instead of one vendor.

**`ksor calibrate`'s Gemini requirement is stated rather than papered over.**
Question synthesis is Gemini-only today, so a record embedding with
`OPENAI_API_KEY` is still refused for a Google key when calibrating through the
synthesized door. That gap is now said plainly in the refusal and in
`docs/ingesting.md`, which taught calibration without mentioning it. The
`--queries-file` door avoids it entirely.

**The OpenAI live test announces itself.** It is gated on `OPENAI_API_KEY`, no
workflow supplied one, and a false `describe.runIf` contributes nothing to a run
— so the suite its own header calls "the tripwire for vendor drift" was absent
from CI and reported as absent by nobody. It now prints `skipped — set
OPENAI_API_KEY`, the way Gemini's does, and CI passes the secret so the tripwire
arms the moment one is added.

Found by an adversarial review of this week's commits.
