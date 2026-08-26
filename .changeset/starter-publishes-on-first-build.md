---
"@panaversity/ksor": patch
---

**A freshly scaffolded record now publishes on its first build.** `ksor init`
then `ksor build` reports **5 admitted to a machine surface**. It reported
**0**: the five starter documents shipped `status: draft`, and a draft reaches
no surface of a build — so a brand-new project came up with an empty
`## Documents` in `llms.txt`, empty `/md/` twins, no document route, and an MCP
door that answered nothing. That was deliberate, and it cost more than it was
worth on the one build that is meant to be simple to get started.

**What changed.** The five samples ship `status: stable` with
`ksor.approval: { by: "ksor-starter/<the CLI version that scaffolded you>" }`,
and the emitted `.ksor/governance.yaml` authorises that actor beside
`human:you`.

**The approver is a producer, not a person.** `ksor-starter/0.0.x` is the same
form `generated.by` already uses, so it can never be read as a human who
reviewed something — which is exactly what the rule against a tool recording an
approval exists to prevent. The trust tier on every one of those pages stays
`unverified`, and no `verified` entry is written. Your record does not claim
anybody checked this, because nobody did.

**Two things to do with the samples.** They describe KSoR, not your
organisation, so replacing them is the first real act on the record — and when
the last one is gone, delete `ksor-starter/...` from `approval_authorities` in
`.ksor/governance.yaml`. Nothing of yours should be approved by a tool. The
emitted README, `AGENTS.md`, the policy file's own comment and the
`intake-interview` skill all say so.

**Nothing changes for what you write.** A new document is `status: draft` and
reaches no machine surface — no page, no sidebar row, no `llms.txt` entry —
until a human approves it with `status: stable` plus a
`ksor.approval: { by, at }` naming an actor your policy authorises.

**Existing records are untouched.** This is the `ksor init` template only; no
verb, refusal or lock field changed, and `ksor migrate` still demotes
`approved` to `draft` unless `--approve-by` names the human approving.
