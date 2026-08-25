---
"@panaversity/ksor": minor
---

**The record is an OKF bundle now.** `knowledge/` is Markdown in the KSoR
Profile of the Open Knowledge Format — the shape the README has described for
weeks and the code did not hold. One rule set reads it: the CLI, the site and
the MCP door all check the same frontmatter through the same module, so a
document that publishes on one surface can no longer be refused on another.

This release is `minor` rather than `patch` because it changes surfaces
adopters depend on. In one place, what moves:

- **A document's frontmatter.** `type`, `title`, `description`, `status`
  (`draft | stable | deprecated`) and `ksor.audience` (a list) are required;
  `stable` additionally carries `generated` and an `ksor.approval` by an actor
  the Governance Policy authorises. `visibility`, `owner`, `provenance`,
  `effective`, `superseded` and `sor_id` are refused **by name**, with the
  migration named in the refusal.
- **Two files beside the bundle.** `.ksor/governance.yaml` says who may
  approve and who may take down; `.ksor/takedowns.yaml` is the committed,
  append-only takedown ledger. Both are tracked, not scratch.
- **`instance.md` is `format: 2`** — `audiences:` and `default_visibility:`
  move into the policy; `title`, `description` and `toolchain:` arrive.
- **Two new verbs.** `ksor build` (database-free: generate the indexes, check
  the record, write `build.lock.json`) and `ksor migrate` (rewrite a
  pre-profile record, printing a diff before it writes anything).
- **Removed:** `ksor takedown --export`, `.ksor-denylist.json` and the
  scaffold's `export-denylist` step. The site reads denials from the ledger,
  so a record with no database has takedown for the first time.

**To upgrade an existing record**, in order:

```sh
pnpm add -D @panaversity/ksor@latest
ksor migrate                      # prints the diff, writes nothing
ksor migrate --write --actor human:<you> --approve-by human:<you>
ksor build
# a served record, after committing the migration:
ksor schema --instance instance.md --apply   # 2.4 -> 2.5
ksor ingest --instance instance.md --flip
```

`ksor migrate` never authors knowledge: a document whose `description` it
cannot derive is refused by name rather than filled in, and an `approved`
document becomes a `draft` unless `--approve-by` names the human doing the
approving. Both are the same rule — a governance act names the actor who
performed it, and the tool does not guess one.

**That is why `--approve-by` is in the block above, and what happens without
it.** Every `approved` document becomes a `draft`, and a draft reaches no
machine surface at all: the next `ksor build` reports `0 admitted to a machine
surface`, and `llms.txt`, the `/md/` twins and the MCP door publish nothing
until a human approves. Where one document supersedes another it does not even
get that far — `ksor build` refuses with `ksor-supersession-strands`, because
the successor migrate just demoted is a draft and a reader sent to it would be
stranded. Pass `--approve-by human:<you>` when you are the person
`.ksor/governance.yaml` authorises to approve; otherwise expect to approve the
record document by document before it publishes again.

**Two things will refuse until you act, deliberately.** A generation ingested
before schema 2.5 will not serve until it is re-ingested, because the
migration can only narrow a ranked tier and half a governance row is not
something a system of record answers from. And a calibrated
`retrieval.vector_floor` measured before this release carries no
`floor_digest`, so the door reports `gate: "uncalibrated"` and abstains until
`ksor calibrate` re-measures it through the predicate that now applies — a
threshold carried across a predicate change stays plausible and stops meaning
what it said.
