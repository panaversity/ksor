---
"@panaversity/ksor": patch
---

**Fix a release gate that broke on the act of releasing.** Four doc-truth
assertions read `.changeset/<slug>.md` directly. A changeset is a transient
file — `changeset version` folds it into `CHANGELOG.md` and deletes it — so
those assertions passed on every feature PR and threw `ENOENT` in the Version
PR, the one run whose failure costs a red release instead of a red PR. It would
have done so on every future release, not just this one.

The assertions were right; only the place they looked was wrong. A new
`releaseNote()` resolves a note to the pending changeset when it is still
pending, and otherwise to the newest section of the changelog it was folded
into — scoped to the newest section deliberately, so a rule adopted in this
release is never asserted against prose written several releases ago.
