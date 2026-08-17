---
name: authoring-skills
description: How to write, improve, or review an agent skill in this repo — SKILL.md anatomy, frontmatter contract, descriptions that actually trigger, what belongs in a skill vs AGENTS.md, and the evaluation loop that proves a skill earns its place. Use when creating a skill, editing one, or deciding whether something should be a skill at all.
metadata:
  version: "1.0.0"
---

# Authoring skills

A skill is a loadable procedure for a recurring task. AGENTS.md carries the always-on one-liner
rules; a skill goes deeper on one workflow. **A skill never duplicates AGENTS.md — it expands on
it.** If the content is a rule every agent needs on every task, it belongs in AGENTS.md; if it is
a deep workflow needed occasionally, it is a skill; if it will be used once, it is neither.

## Anatomy

```text
.agents/skills/<name>/
├── SKILL.md          # frontmatter + the procedure
└── references/       # optional: deep material loaded on demand
```

- The directory name IS the skill's identity. Frontmatter `name` must equal it — guard rule 3
  enforces this (identity derives from the path; an authored name that disagrees gives one skill
  two identities).
- `.claude/skills/<name>` must be a symlink to `../../.agents/skills/<name>` — guard rule 2.
  The canonical tree is `.agents/skills/`; per-tool trees are projections.

## Frontmatter contract

| Key                | Required | What it does                                                       |
| ------------------ | -------- | ------------------------------------------------------------------ |
| `name`             | yes      | must equal the directory name                                      |
| `description`      | yes      | the ONLY text agents see before loading — it decides triggering    |
| `metadata.version` | yes      | bump on every edit, so consumers can tell which revision they read |

Exception: **vendored skills** (hash-pinned in `skills-lock.json`, like
`find-skills`) keep their upstream frontmatter untouched — editing them breaks
the hash pin. The contract above applies to skills authored in this repo.

## Descriptions that trigger

The description is a routing rule, not a label. Name the tasks, the trigger phrases, and — when a
skill must NOT fire — the anti-trigger.

- Bad: `description: Helps with documentation.`
- Good: `description: Corpus and docs authoring — where a new document goes, required frontmatter,
the source-of-truth hierarchy. Use when adding or editing anything under knowledge/ or docs/.
Not for README marketing copy.`

## The evaluation loop

A skill earns its place by beating its absence. Before landing a new skill: run the task once
without the skill and once with it (fresh context each time), and keep the skill only if the
with-skill run is visibly better — fewer wrong turns, correct output shape, rules actually
followed. Record the comparison in the PR description. A skill nobody can show winning is deleted,
not kept "just in case" — code is liability, and so is context.

## Editing an existing skill

Bump `metadata.version`, keep the description's trigger phrases in sync with reality, and run
`pnpm guard` — rule 3 will catch a renamed directory or a drifted name field.
