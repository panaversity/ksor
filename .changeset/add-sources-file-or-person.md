---
"@panaversity/ksor": patch
---

`add-sources` 2.0.0: a file or a person, one skill — with a check the agent
runs instead of a rule it is asked to follow.

Two issues asked for two paths into the record. #31: an owner with a folder of
PDFs had no path — the skill stated the rules and converted nothing. #50: an
owner whose knowledge is only in their head had no path — the interview scoped
the record and stopped, leaving `knowledge/` full of samples about KSoR.

**They are one skill, not two.** The record draws no line between the kinds:
an interview attestation in `sources[].resource` passes `ksor build` today,
the fidelity rules read the same for both, and a real owner has BOTH — the
policy PDF and the exception everyone knows that the PDF never mentions. So
the person step runs after every file: "what does this not cover?" is the
question that finds the pages nobody wrote. A sibling skill would have made
the agent choose before it knew, and #50's own three-way trigger collision
vanishes.

**The source is a file.** Extract first, into a scratch file outside
`knowledge/` — the skill names the extractor per format (`pdftotext`,
`pandoc`, macOS `textutil`, `markitdown`) and what to do with none on `PATH`:
read the file directly and SAY the verification that follows is weaker. An
empty extraction is a scanned image, and the skill stops and tells the owner
rather than OCR and hope. Then decide the shape of the record, convert to
CommonMark a person would have written, name the source precisely, and run
the shipped check:

```
node .agents/skills/add-sources/verify.mjs /tmp/in.txt knowledge/<path>.md
```

`verify.mjs` — plain Node, no dependencies, the owner's to keep — lists every
number, date, threshold, code and capitalised name in the document's body that
does not appear in the extraction, case-folded and whitespace-collapsed.
Frontmatter and footnote ids are exempt, because they are the agent's words by
design. It is a floor, and says so: a value that passes was in the source; it
cannot see a value that was dropped, and it cannot tell a paraphrase from an
invention. Model-driven conversion is highest-fidelity for layout and
lowest for exact values, and this is the mechanical half of "copy load-bearing
values exactly".

**The source is a person.** Ask one question at a time in their words — who
triggers it, the steps, who approves and at what threshold, what goes wrong,
the exception — until someone who was not in the room could act on it. Draft
as the record, not a transcript; anything unconfirmed is an `Open question:`
line, never prose. The attestation goes in `sources` (who, role, instant,
conducted by) — there is no `provenance:` key, and no transcript is kept.
Two people describing one process differently stay two cited statements.

**Both end the same way, and the ending is new.** Read it back on `pnpm dev`,
then ask the owner to approve and write down what they said. A draft reaches
no machine surface, so a skill that stopped at the draft left every `llms.txt`
and every door empty — found on the journey walk: `1 document(s), 0 admitted`.

The rules that were restated here (placement, frontmatter, audience,
deprecation) now point at the emitted AGENTS.md instead. The trigger test that
asserted "no skill claims dictated knowledge" flips: add-sources claims it by
name, and no other skill may. Eleven cases hold `verify.mjs` to what it does
and, in three of them, to what it does not claim.
