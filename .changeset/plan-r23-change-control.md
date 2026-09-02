---
"@panaversity/ksor": patch
---

`ksor-generated-stale`: the first change-control verification (KSP R23). A `stable` document whose body differs from a committed version that was `stable` under the same `generated.at` is now refused by `ksor build` and `ksor ingest` (the scaffold's `pnpm check` stays the format gate and does not run it), naming the commit whose body differs, its instant and the stamp. The fix it prints is the whole of it: set `generated.at` to an instant after the edit, then re-approve, because `ksor.approval.at` may not precede it (`ksor-generated-after-approval`, unchanged). Only the body is compared, so adding a `verified` entry or re-approving is not an edit; a document stable for the first time, or renamed, has no history to compare and passes; every committed version is read, so an edit committed without a bump is refused on a clean tree too.

Where history cannot be read — no repository, no commit yet, a container without `.git`, a shallow clone — each verb prints `change-control: not checked` (or how many versions a shallow clone let it read) beside its verdict instead of passing. Who approved is still checked against the policy alone: every envelope keeps `approval.checked: "policy"` until R22/R25 have an identity source to verify against.
