---
"@panaversity/ksor": patch
---

Prune the scaffold's skills to the three that make a record, and fix the two
seams every adopter hits on the way to one.

**Removed: `make-slides` and `make-summary`.** They were 45% of all shipped
skill text and 21.6% identical to each other — their own commit says
"make-summary is make-slides' discipline applied to prose". A companion is
downstream of a record existing and invisible to the agent surface (no route,
no `llms.txt` line, no MCP node); no fixture and no tutorial ever fired either;
and neither was ever shown to beat its absence, which is the bar AGENTS.md sets
for keeping a skill at all. Their one real rule — a card may only say what its
document says — already lives in the emitted AGENTS.md, and the site renders
companions exactly as before. Verified: the emitted checker passes with both
gone. `format-checker/SKILL.md` is cut to what AGENTS.md does not say; the
program it names is unchanged.

**Fixed: `intake-interview` was contradicting itself in its trigger.** The
always-resident description promised "seven questions"; the body has asked
three since 2026-08-26. The body handed off to "question 4" and "question 5",
neither of which exists, and claimed `add-sources` writes `verified:` entries —
nothing does. 1.6.0 says three, hands off to add-sources with whatever material
the owner has, and drops the false claim.

**Fixed: the recommended path turned a green record red.** Walked on the
published package:

- The README said run the interview, then "delete each starter as your own
  knowledge arrives". Delete the five first and the build refuses
  `ksor-record-empty` and writes nothing — a slug named by no document an
  adopter reads. The README now says to write and approve one document of
  your own before the last starter goes, and names the refusal.
- The hello-world tutorial approves as `human:you`. The interview then retires
  `human:you` from the policy, and the tutorial's own document — still approved
  by an actor the policy no longer names — refuses `ksor-approver-unauthorised`.
  The interview now re-attributes every act recorded under the placeholder to
  the owner's handle in the same change: it is the same person.

**Consolidated:** "the record says only what its source says — a gap is an
open question, never filled from general knowledge" lived only inside
`add-sources`; it is now stated once in the emitted AGENTS.md where every
other writing rule is.

Two deterministic gates hold all of this: a skill-consistency lint (a trigger's
question count matches its body; every "question N" resolves; every refusal
slug a document names is one the product raises; every skill a document names
ships) and a journey walk against the built CLI (interview → one draft →
approve → delete starters → retire the starter actor, plus the exact state
each refusal fires on). Every lint assertion was mutation-tested.

Found by four independent reviews of the plan to build a system of record,
before building any of it.
