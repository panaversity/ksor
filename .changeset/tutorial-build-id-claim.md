---
"@panaversity/ksor": patch
---

Correct a claim the tutorial made about `build_id`, and guard the general rule.

`buildIdOf` hashes `ksor_version` along with the record — deliberately, because
"what produced this" is part of what a publication is. So a captured `build_id`
is correct for exactly one release, and the sentence 0.0.54's tutorial fix added
— "Your timestamp will differ; the `build_id` will not" — was already false when
0.0.55 published it. A reader on any later ksor sees a hash that does not match
theirs and nothing saying why.

Found by walking the published package rather than by reading the diff: the same
practice that caught the tutorial being uncompletable caught the correction being
wrong.

The tutorial now says the id carries the toolchain, names the version its
outputs were captured on, and points at the reproducibility a reader can
actually check — run `ksor build` twice on one tree and the id is identical.
Both captured blocks are re-taken from a 0.0.55 walk.

A guard in `docs-truth.integration.test.ts` holds the general rule rather than
the sentence: a document printing a concrete `build_id` must say what moves one,
within 700 characters of the id. It is PROXIMITY rather than presence — the
first version asked whether "toolchain" appeared anywhere in the file, the file
already used the word once for an unrelated reason, and removing the caveat left
it green. Caught by mutation, and the tightened version immediately found a
second uncaveated id in the same document.
