---
"@panaversity/ksor": patch
---

Make the emitted scaffold docs survive being followed literally

A first-hour walkthrough obeyed the emitted README word for word and hit four
dead-ends. Each is now fixed where the reader meets it, not only in the deep
doc that already got it right.

- **The publish recipe was incomplete and refused.** "`status: stable` with a
  `ksor.approval`" is two thirds of it — `ksor-stable-ungenerated` also demands
  `generated: { by, at }`, which appeared nowhere in the README. It now shows
  the whole frontmatter shape, says which half is provenance (any producer) and
  which is authority (an actor `.ksor/governance.yaml` lists), and names the
  ordering rule between the two `at`s.
- **"The ordered path is:" was not the order.** The command block ran before
  the instruction to uncomment `database:` in `instance.md`, which sat thirteen
  lines below it, so step two died with `instance.md declares no database:
block`. The emitted `AGENTS.md` had the right order all along; the README now
  matches it — config, environment, then commands.
- **The Docker smoke test refused with the `.env` the README told you to
  write.** A container sets `$PORT`, so the door binds `0.0.0.0` and
  `KSOR_AUTH=disabled-local` correctly refuses. The refusal is right and stays;
  the printed command now carries `-e KSOR_AUTH=disabled-public` and says why,
  on the command rather than in `.env` so an ordinary `ksor serve` keeps its
  loopback posture. Fixed in the README, `AGENTS.md`, the `Dockerfile` header,
  `.env.example` and `docs/deploying.md`, which now all print one recipe.
- **`ksor` reads `.env`, but a refusal says "export that variable".** Both are
  true and a newcomer met both; the README now says so in one sentence.

Two smaller truths: `pnpm refresh` builds before it ingests, and both places
that describe it said otherwise; and `instance.md`'s own description of the
starter claimed "types, statuses, audiences, a folder and a companion summary"
where the starter is in fact five approved documents, all one type, one status
and one audience, three of them in a folder, with one carrying all four study
attachments.

New: a short **note on `audit`**. A fresh `npm install` ends with high-severity
advisories against the pinned `next` and an invitation to `npm audit fix
--force`, which would break the pin — and nothing said not to. The note says
don't let an audit tool raise the pin, explains the one structural reason the
report reads worse than it is (the site is a static export, so no framework
server, middleware, server actions, rewrites or image optimizer ever run), and
names what that argument does NOT cover: the build toolchain, and any served
route added later.
