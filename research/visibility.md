---
issue: "panaversity/ksor#10"
status: accepted
last_updated: 2026-08-18
---

# Visibility — the evidence behind the spec

The measurements that priced the design in `specs/ksor/visibility/spec.md`.
All of them were produced adversarially before any spec existed (issue #10
carries the full write-up); this page distills what was **reproduced**, in
the order it decided the design. Method throughout: plant three canary
strings in one restricted document (title, description, body), build,
`grep -rl` the whole artifact for each — binary outcome, no interpretation.

## What decided the design

1. **Both shells publish restricted documents today — 2/2.** The reference
   shell put a restricted document's title into **21 files** of a
   4-document build (every page's sidebar embeds every title, and the RSC
   payloads duplicate it); the Docusaurus shell leaked the same canaries
   into 10 files including its search index. This rules out render-time
   hiding entirely: suppressing a document's page leaves its title on
   every other page.

2. **The obvious Docusaurus fix is itself a leak.** Passing hidden
   filenames to the docs plugin's `exclude:` zeroed every canary — and
   serialized the exclusion list, with the record's absolute path, into
   the client bundle served to every visitor. A correct filter that ships
   to the browser is a leak wearing the costume of a fix. This is why the
   shell contract's fifth clause forbids serializing the filter, not just
   leaking the documents.

3. **Partial filtering looks governed and is not.** Filtering only
   `readRecord()` in the Docusaurus shell produced a clean `llms.txt` —
   the surface an auditor checks first — while the document stayed live at
   its URL and fully indexed in search. A shell that cannot filter every
   surface must refuse to build, not build partially.

4. **B (per-audience builds) vs C (per-request filtering), measured, not
   argued.** On containment they tie: zero canaries reach an unauthorized
   reader either way. On everything else they do not:

   |                              | B — build-time         | C — per-request  |
   | ---------------------------- | ---------------------- | ---------------- |
   | Where restricted bytes live  | not on the public host | on it, gated     |
   | A consumer nobody remembered | still filtered         | reads unfiltered |
   | Granularity                  | nested audiences       | arbitrary roles  |
   | Static export / any host     | kept                   | lost             |

   The row that decides it: wiring C failed the build on a **fifth**
   consumer of the record the author had not enumerated, and a **sixth**
   surfaced immediately after (the home page's document counter, reporting
   3 documents to public and 4 to restricted). TypeScript caught the miss
   only because a signature changed; an optional parameter defaulting to
   unfiltered would have compiled and leaked silently. Six consumers in a
   four-document scaffold — and `system/site/` is adopter-owned code that
   grows consumers we will never see. C did pass its own checks
   (fail-closed on unrecognized claims, 404-not-403, clean client bundle,
   600 interleaved concurrent requests with zero cross-audience
   violations) — C is _workable_; it is not _safe by default_.

5. **Staging beats in-process filtering even where in-process works.**
   The reference shell's 4-line source filter zeroed every canary — but
   `lib/source.ts` imports the raw collection, so any future route
   handler could bypass the filter entirely. A filtered directory on disk
   has no bypass: what is not there cannot be read, by any reader,
   including the ones nobody counted.

6. **The leak no build can catch.** With all canaries at zero, a _public_
   document containing `[compensation bands](../compensation.md)` still
   shipped the URL and link text of the hidden document into 6 files. The
   build that publishes the link has already dropped the target and
   cannot know it existed — only a whole-record check can see across
   audiences. That is checker rule 6's existence proof. (Notably,
   Docusaurus's `onBrokenLinks: "throw"` caught it; the reference shell
   published it silently.)

7. **The asset hole.** An image referenced only by a restricted document
   is copied into every build — filename and bytes — under both shells'
   naive filters. Staging that copies only permitted documents _and only
   the assets they reference_ closes it; the spec makes this a blocker,
   not an open item.

8. **A canary sweep without a positive control fails open.** The
   measurement produced false negatives twice — once a missing binary in
   a shell function printed 0 hits from a command that never ran; once
   trailing-slash redirects meant the probe grepped redirect bodies, so
   "search is filtered" actually meant "search is dead." The conformance
   test therefore asserts both directions: the canary absent from the
   restricted-excluded build AND present in the control build.

## Reference implementations (preserved)

Working code for all three approaches was produced during the
investigation and preserved as conversion material (decision-6 style: mine
it, re-earn each mechanism with tests here): the B filter for the
reference shell, the full C implementation with all six consumers
threaded (`lib/audience.ts`), and the Docusaurus staging build. Their
measurements are the tables above; the implementations themselves land
only through the spec's acceptance, red-first.
