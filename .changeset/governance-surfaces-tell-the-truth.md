---
"@panaversity/ksor": patch
---

Four places where the product was wrong about itself.

**A governance key one level from where the profile reads it is refused by
name** (`ksor-key-misplaced`). `effective_from:` at a concept's top level is
spelled correctly, so no near-miss net could see it and OKF §11 preserved it —
a document embargoed to 2099 built clean, exited 0 and published the same day.
The mirror, `ksor.stale_after`, was refused as a key of a closed block and told
the author to "remove `stale_after:`"; following that remedy on a document
already past that instant flipped it from withheld to published. Both
directions are now named, and no remedy in the profile deletes a governance
value — an unrecognised key under `ksor:` is moved to the top level, where §11
preserves it.

**Every surface now says whose claim the trust tier is.** `verified[].by` is
checked for its actor form and nothing else: the Governance Policy has no
verification family, so any well-formed `human:` actor promotes a document to
`human-reviewed` — while `ksor.approval.by` is refused outright when no rule
matches it. That asymmetry is deliberate (record spec §2.3) and unchanged; what
changed is that the `search` and `read` tool descriptions, the emitted
`.env.example` and the emitted `AGENTS.md` said or implied otherwise. At
`KSOR_MIN_TRUST_TIER=human-reviewed` the only document a record served was the
one asserting its own review. The tool definitions grow 520 chars for it
(16,214 → 16,734 as transmitted, ~4,054 → ~4,184 always-resident tokens);
`packages/ksor/docs/tool-surface.md` has the re-measured table.

**`ksor build` says what its own snapshot will stop being true.** Machine-surface
admission is decided once, at the build's `as_of`, and written into files that
cannot re-decide themselves — so a document whose `stale_after` passes after a
build keeps appearing in `llms.txt` and its markdown twin while `ksor serve`
already refuses it. The build now names the documents it held back and why, and
the next instant at which this goes out of date. It is a notice and not a
refusal: a document past its review date is a governed state, and a build that
refused it would make deleting the `stale_after` the fastest way to green. The
emitted `AGENTS.md` stated the exclusion unconditionally and now states the
rebuild obligation instead; the emitted `README.md` carries it too.

**Three `ksor takedown` remedies name `--actor`.** Decision 21 requires it on
every mode that writes the ledger, so the printed fix lines exited 1 on
`ksor-takedown-unattributed` when pasted.
