---
"@panaversity/ksor": patch
---

Installing ksor no longer pulls 32 MB of vendor SDK

`npx @panaversity/ksor init` installed 54 MB across 52 packages. 32 MB of that
was `@google/genai` and its dependencies — carried by every adopter, including
the ones who only ever run `init` and `dev` and never reach a served rung.

It existed to make two HTTP calls, both already wrapped behind one
structurally-typed client boundary. Those calls are now spoken directly:

```
before   54 MB   52 packages
after    22 MB   22 packages
```

Nothing about the embedding changed, and that was checked first rather than
assumed: the SDK and the REST endpoint return **byte-identical vectors** for the
same text, model, dimensionality and task type — a maximum per-component
difference of 0.000e+0 at 1536 dimensions. So stored embeddings stay valid and a
calibrated `vector_floor` keeps its meaning. Had they differed by a rounding
step, this would have quietly invalidated abstention on every existing record.

The provider seam is unchanged: a deployment that prefers an SDK can still
supply one through `clientFactory`. The single live call to the real vendor
stays where it was, as the tripwire for API drift, and now meets Gemini with
nothing in between.
