# Settled decisions

The decisions this project operates from, each with the evidence that settled
it and the condition that would reverse it. This file exists because the
predecessor cited this exact path as holding five settled decisions, never
wrote it, and the decisions survived only in one assistant's memory — which
forced a licence question to be re-litigated four days after it closed.

**Rule:** work that contradicts a settled decision stops and goes back to a
human (see AGENTS.md, Governance). A decision changes by editing this file with
new evidence, never by silently coding around it.

---

## 1. TypeScript and npm are the front door — settled 2026-08-17

Not because "TypeScript is the agent-era language" — research refuted that
framing and it is dropped from the pitch. The deciding argument: the
predecessor's Python CLI never shielded anyone from Node. Its own
`site_runtime.py:107` aborts when `node` is missing ("the site verbs run
Docusaurus, which needs Node >= 20 and npm") and line 533 shells out to
`npm ci` at user runtime. The site toolchain must execute on the user's
machine, so it cannot be vendored away the way Zensical hides Rust inside a
Python wheel. Python was a second mandatory runtime that bought the adopter
nothing — pinned at `>=3.14`, covering under 7% of measured PyPI download
volume ten months after release, against Node `>=20`, which excluded zero
supported installations.

**Reversed if:** the end user ever stops needing a local Node build — a
prebuilt site bundle, a hosted build service, or self-contained site tooling.
Then Node stops being a prerequisite, Python becomes the only runtime, and
Python wins outright.

## 2. The retrieval kernel stays Python, offline — settled 2026-08-17

Checked against the live kernel rather than assumed. Abstention enforcement is
a scalar comparison whose floor arrives from instance config
(`abstain.py:3`: "Floors arrive from INSTANCE CONFIG
(`retrieval.vector_floor`), never module globals — a floor is a per-corpus
calibration; `vector_floor: null` means UNCALIBRATED → the gate is OFF and
surfaced on /health"). Calibration is a separate console script
(`sor-content-calibrate`) the server never imports. The moat is a number in a
config file plus an offline lab tool — both of which a TypeScript runtime can
carry.

**Reversed if:** threshold derivation turns out to happen online at serve time
rather than offline — then the answer becomes a service split, not a rewrite.

## 3. Package scoped (`@panaversity/ksor`), command bare (`ksor`) — verified 2026-08-17

Unscoped `ksor` is rejected by npm's similarity filter (too close to `koa`,
`cbor`, `bser`, `swr`, `bson`, `json`). The filter blocks everyone, so the
unscoped name is frozen rather than at risk. Scoping changes the package, not
the command — proven by installing the published artifact:
`npm i -g @panaversity/ksor && ksor` → runs, exit 2;
`npx --yes @panaversity/ksor` → fetched from the registry, exit 2.

**Reversed if:** never — but note the recorded lesson below: a registry 404 is
not evidence a name is publishable.

## 4. Licence: Apache-2.0, whole repository — closed 2026-08-11

Applies to the entire repo and the published package. Separate from the Python
copy grant (a blocker tracked in `docs/status.md`, not a licence question —
that question closed on this date and is not reopened).

**Reversed if:** an explicit relicensing decision by the owner, recorded here.

## 5. Distribution: copy-into-repo, shadcn model — settled 2026-08-11 (decision 0b)

"Ownership comes from the scaffold." What `ksor init` emits belongs to the
adopter's repository — updates are offered, never imposed; the framework does
not reach into a consumer's corpus.

**Reversed if:** a class of scaffold file emerges that must stay
framework-owned to preserve a product guarantee (that file would then ship in
the package, not the scaffold — a per-file exception recorded here, not a model
change).

## 6. PyPI name `ksor` deliberately not claimed — settled 2026-08-17

A reservation package was built and then deleted on the owner's call. KSoR
ships on npm; a Python package sitting in a TypeScript repository misleads
every reader about what the project is, and the exposure is low — `ksor` on
PyPI is obscure and nothing points at it. Recorded so nobody re-adds it
thinking it was an oversight. If it is ever wanted: a PyPI _pending publisher_
reserves nothing ("a 'pending' publisher does not create a project or reserve
a project's name until it is actually used to publish") — the only real claim
is an upload.

**Reversed if:** the exposure changes — e.g. a typosquat appears, or KSoR
ships an official Python client.

## 7. Base environment toolchain — settled 2026-08-17

TypeScript 7.0.2 (native compiler; no dependence on its programmatic API —
guard rule 6), Node `>=24`, pnpm 11.22.0 exact-pinned, pure ESM, tsdown build,
vitest 4 in filename tiers, oxlint + oxfmt, minimal turbo, changesets with npm
trusted publishing, corpus checks + guard invariants as the primary test
surface. Full ledger with per-pin evidence: `research/base-environment.md` §2,
derived from studying vercel/eve, workflow, ai, and next.js.

**Reversed per-pin if:** the recorded caveat fires — e.g. TS 7.1 ships a
stable compiler API (lifts guard rule 6's constraint on tooling choices), or
oxfmt fails on real code (fallback recorded in the ledger: Biome 2.5).

---

## Recorded lessons (mistakes that must not be re-learned)

- **A 404 on the npm registry does not mean a name is publishable.** npm runs
  a separate similarity gate at publish time that no lookup exposes. `ksor`
  passed every availability check and was rejected with `E403`. The only
  reliable test is attempting the publish.
- **A PyPI pending publisher reserves nothing.** It only pre-authorizes a
  workflow to create the project; the name stays open until something is
  uploaded.
- **The four shipped-defect lessons** (test tier must be structurally identical
  to the artifact) are codified in AGENTS.md → Testing, with the full
  post-mortems in `research/handover-vsor-to-ksor.md`.
