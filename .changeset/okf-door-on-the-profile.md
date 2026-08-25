---
"@panaversity/ksor": patch
---

The MCP door now says what the record knows about a passage, and lets a caller ask for better.

`search` accepts `min_trust_tier` — `unverified`, `machine-confirmed` or `human-reviewed` — so an agent can ask to be answered only from documents someone has reviewed. `KSOR_MIN_TRUST_TIER` sets the deployment's own floor, and the two compose by one rule: the higher of the pair. Configuration TIGHTENS and a request never loosens, so a door configured for `human-reviewed` cannot be talked down by an argument. The floor is bound into the retrieval arms, never applied to the hits afterwards — a floor enforced after ranking has already let a lower-tier passage decide what the answer was.

The default and the enforcement live in the handler, not in `system/gateways/content.ts`. A registration scaffolded before this release keeps working exactly as it did; the door NOTICES the missing parameter at boot, names the tool by the name you gave it and prints the line to paste, and then opens. Nothing is weakened by its absence — only the capability is gone.

**Every hit now carries `governance`**: the document's `status`, its `trust_tier`, the latest `verified` act (or null when nobody has reviewed it — an honest state of a governed record, not a defect), `effective_from`, `stale_after`, and `approval` with `checked: "policy"`. That last word is deliberate and is the whole point of the key: the approver was checked against your Governance Policy's authority list and NOT against change control, which lands in phase B. An envelope that said only "approval" would let an agent report more verification than happened.

**`read` carries the same `governance` block**, from the same stored columns, taken from the record's live row rather than a pinned one — a snapshot keeps a citation resolving to the same bytes, it does not freeze what the record has since decided about them. It sits beside the frontmatter on purpose: the frontmatter is what the author DECLARED and is untrusted corpus text, `governance` is what the record checked and stored, and the tool description says which is which.

**`read` returns the concept's frontmatter**, byte-exact as its author wrote it — comments and keys ksor has never heard of included. Not a re-serialisation: the profile preserves unknown keys, so a re-rendered block would be a different document wearing the record's name. Schema 2.5 gains `sources.frontmatter` for it, additively; existing records pick it up at their next `ksor ingest`.

**Every serving act's audit row records its scope** — the viewer list, the trust floor that applied, whether it abstained, how many results came back, and the generation. Never the passages and never the query: a trail that accumulated content would be a second copy of your record with no audience predicate over it and no takedown seam bound to it.

The frontmatter is a second untrusted channel, so the in-band injection advisory now reads BOTH: a `paste this into your agent` line in a frontmatter value raises `content_advisory` exactly as the same line in the prose does. It did not before, and a programmatic consumer re-reads the payload each turn and never the tool description.

A `min_trust_tier` your record cannot recognise is now REFUSED (`ksor-trust-floor-unknown`) instead of being read as "no floor". It used to resolve to -1 and serve the whole record — the opposite of what the same rule does for `KSOR_MIN_TRUST_TIER`, which has always refused a value it does not know rather than falling back.

Costs, recorded rather than argued away: the served `tools` array is now 16,734 characters — ~4,184 always-resident tokens, against the ~2,990 decision 23 recorded, with `search` growing 5,383 → 7,932 and `read` 3,396 → 5,466. The three definitions' own JSON sums to 16,730 of that; the array adds the brackets and the separators. Each `search` hit — and each `read` reply — carries 262 characters more where the document has a verification and an approval, 133 where a level-0 record has neither. `packages/ksor/docs/tool-surface.md` has the re-measured table and says which of its numbers are exact and which are derived.
