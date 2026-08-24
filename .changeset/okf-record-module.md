---
"@panaversity/ksor": patch
---

Add the record module (`packages/content/src/record/`): the KSoR Profile of OKF as zod schemas, the governance policy and takedown ledger readers, the record checker, and the OKF §8 index generator — the foundation `ksor build`, `ksor migrate` and the emitted `check.mjs` are built on. The CLI now carries `yaml` (2.9.0, ISC, zero transitive dependencies) as a runtime dependency, because a profile-shaped document's `ksor:` block and the `.ksor/*.yaml` control files are real YAML that no line scanner can read.
