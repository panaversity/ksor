---
"@panaversity/ksor": patch
---

Hash `.ksor/people.yaml` into `build_id`, so the two surfaces of one build
cannot publish different provenance.

The phone book added in 0.0.53 rewrites the actor printed on every Owner,
Approved, Withdrawn and Trust row — `displayActor` replaces `human:contractor-a`
with "Human: Jane Doe, VP Compliance", and the identifier does not appear on the
page at all. It was hashed by nothing. `.ksor/governance.yaml` and
`.ksor/takedowns.yaml` are both in `build_id`; this one was left out, on the
stated reasoning that including it would refuse the next site build after a
spelling correction.

That is the trade critical rule 1 forbids, and the consequence was reachable
without doing anything unusual: edit a name, `pnpm check` stays green,
`ksor build` emits a byte-identical lock, and the deployed page publishes an
approver the `/md/` twin stamped with that same `build_id` contradicts. An
auditor reconciling the page against the lock finds nothing wrong, because the
string they are auditing was never covered by it.

Now: `people_sha256` joins `policy_sha256` and `ledger_sha256` in the lock and
in `build_id`; `.ksor/people.yaml` joins the inputs that move `source_commit`;
and the site's staleness gate compares it like the other three, so an edit the
lock never saw refuses with `ksor-lock-stale` naming the file. Refusing until
`ksor build` is re-run is the behaviour, not a regression — it is what every
other published byte already does.

Two things found alongside it, in the same file:

- `people.ts` claimed "duplicate keys are refused by the parser rather than
  resolved by whichever came last". They were not. `uniqueKeys: true` makes the
  parser RECORD a duplicate; `toJS()` still resolves last-wins, and nothing read
  the errors — so two entries for one actor published the second person's name
  on the first person's approval, the precise collision the map replaced a name
  derivation to avoid. A duplicate now drops the whole book, and identifiers are
  published instead.
- The rule lived behind a module that reads `instance.md` on import, so it could
  only be tested by building a record on disk — which is why it shipped asserted
  by a comment. It is now a leaf, `lib/people-rule.ts`, with the shipped
  function under test.

**Upgrading:** a lock written before this refuses with `ksor-lock-invalid`
naming `people_sha256`; run `ksor build` and commit the lock it writes.

Found by an adversarial review of this week's commits.
