---
"@panaversity/ksor": patch
---

Begin the record module (`packages/content/src/record/`) that the OKF-native record (`specs/ksor/record/spec.md`) will be checked and built by. This change ships its foundation: a frontmatter splitter that reads real YAML — one document, unique keys, plain data only, the closing fence found by a line walk — and refuses anything else as `ksor-frontmatter-invalid` with the reason and the fix; the profile's enumerated refusal slugs as a typed set. The CLI now carries `yaml` (2.9.0, ISC, zero transitive dependencies; decision 26) as a runtime dependency, because a profile-shaped document's `ksor:` block and the `.ksor/*.yaml` control files are real YAML that no line scanner can read. Nothing yet consumes the splitter; `ksor build` still exits `2`.
