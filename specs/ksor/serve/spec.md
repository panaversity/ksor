---
status: draft
date: 2026-08-19
claim: whether an agent can be trusted is decided by the governance of what it reads — serve is where provenance, citations, and the measured floor become answers
evidence: research/kernel-conversion.md · sor-agentfactory @ b554f91 (production oracle)
---

# ksor serve — the agent surface

The MCP surface over a built record: governed evidence with citations and
honest abstention, converted whole from the production kernel
(`research/kernel-conversion.md`, AGENTS.md decision 11). Serve is the rung
an adopter climbs to — `ksor init` and `pnpm dev` never require it, a
database, or a provider key.

## Observable contract

**Tools — evidence, never prose.** `search` (governed passages, each with
citation + generation + score), `outline` (the record's structure in reading
order), `read` (one document, byte-faithful; the predecessor's
`read_lesson`, renamed corpus-neutral). The calling model composes answers;
serve never runs a generation-side model. The query embed is the one
provider call at read time.

**The envelope is a discriminated union** (code wins; corrected to the
implemented shape 2026-08-19): `{ ok: true, abstained: false, hits,
snapshot } | { ok: false, abstained: true, reason: "abstained", hits: [],
snapshot }` — abstention is a type a caller branches on at compile time,
never a phrasing. Each hit carries `provenance` (corpus_id, stable_id,
slug, generation, retrieved_at); the `snapshot` token pins the generation
a search answered from and the read tool honors it — an invalid or expired
token never errors, it serves active and says why (`snapshot:
"refreshed (<reason>)"`). Only served generations are queryable (the
generation CTE resolves `COALESCE(pinned, active_generation)` inside every
statement — the generation is the authorization).

**Abstention is the retrieval gate**, with THREE representable states
(the fail-closed invariant made grammar — review, 2026-08-19):
`retrieval.vector_floor:` a NUMBER gates (abstain below it); ABSENT/`null`
declares no gate (off, surfaced honestly — "will not refuse out-of-corpus
questions"); the literal `uncalibrated` is a DECLARED-but-unmeasured floor
that REFUSES every serve (search and read alike) until a number is pasted —
a corpus that intends to gate must not serve ungated or on a guess. Floors
are calibrated per corpus per embedding space by the converted calibrate
method, human-ratified into instance.md, measurement and door recorded
beside the number. A floor is a threshold inside ONE retrieval predicate, so
`ksor calibrate` also writes `retrieval.floor_digest:` — the digest of the
predicate it measured through. A declared number whose digest is not the
serving predicate's, ABSENT included, enters the same
declared-but-uncalibrated refusal, and `gate` on the wire reads
`uncalibrated` rather than `off`: a number that no longer describes the set
it gates is not a rung on the ladder, and `off` would tell an agent this
record cannot abstain. **The config layer fails closed on the same principle
as the gate**: unknown top-level keys are refused, never dropped, so a
misspelled `retreival:` cannot silently disable the gate.

**Degradation fails closed.** If the embedding provider is unreachable and a
vector floor IS declared, serve ABSTAINS — the gate cannot be evaluated
without the embed, and keyword search does not separate in- from
out-of-corpus (a measured negative result), so serving keyword results
ungated would answer out-of-corpus questions during the outage. Only a
corpus with no declared floor (gate already off) serves keyword-only under
an outage, and says so (`degraded_reason`).

**Revocation closes the snapshot window.** A snapshot pins a generation; a
pinned read is honored only while that generation is still SERVABLE (the
active pointer or the rollback pointer). A rolled-back (withdrawn)
generation is neither, so its outstanding tokens refresh to active
(`snapshot: "refreshed (withdrawn)"`) instead of serving withdrawn content
for the token's TTL. "The generation is the authorization" holds at read
time, not only at issue time.

**Serving fails safe** (decision 7). Local serve binds loopback with auth
off. A public bind refuses to boot unless auth is configured or
unauthenticated serving is explicitly flagged — a dropped auth variable must
never silently ship an open door. ONE transport: stateless Streamable
HTTP — the shape the production gateway ships, spoken by hosted clients
and local coding agents alike against a URL (no stdio door; one obvious
way). The bind is the posture: unset PORT → loopback (the dev door,
rebind-protected, safe with auth off); a public bind is deliberate.

**The protocol revision is 2026-07-28** (SDK v2's `createMcpHandler`;
decision 13 revision 2026-08-20): handshake-free, with `server/discover` in
place of `initialize` and the per-request `_meta` envelope. 2025-era clients
are still served through the same stateless idiom, so adopting the current
revision is not a cutoff for assistants that have not moved. Both eras are
pinned by acceptance tests — the MCP client alone cannot prove which era is
served, because it negotiates whichever the server offers.

**The snapshot token binds the viewer.** A pin re-serves the generation a
search answered from, so without the viewer in its digest a token minted for a
public caller would re-serve that generation to an internal one, and back — the
one route where a value the CALLER holds could widen or narrow what they are
shown. Proved from the door with two servers differing only in `KSOR_AUDIENCE`.

**Visibility.** Serve reads the staged tier of the audience it is built
for — the same seam and five guarantees as the site shells
(`specs/ksor/visibility/spec.md`). Nothing outside the tier is on disk for
any tool to return.

**Errors are documentation.** Refusals exit 1 with a remedied message;
environment failures exit 3. The kernel is BUNDLED into the one published
package `@panaversity/ksor` (decision 12 publish revision 2026-08-20): the CLI
inlines the kernel and exposes one `ksor` binary. `ksor serve` no longer exits
2 — it runs the gateway IN-PROCESS (a direct import of the bundled boot;
stateless HTTP, loopback by default, a public bind deliberate), reading
`./instance.md`. A missing `instance.md` exits 3 with a remedy. The corpus
operations `ksor ingest`/`schema`/`calibrate`/`gc` are the same binary.

## Acceptance

1. Conformance fixtures extracted from the Python oracle pass: same gold
   sets, same schema contract, same calibration outcomes on the recorded
   history.
2. Behavioural evals gate in CI (AGENTS.md → Testing): abstains
   out-of-corpus including scope-adjacent near-misses; every citation
   resolves; an unpublished generation is never served; at least one
   question whose only passing answer is the abstention.
3. The envelope union is exercised by a compile-time branch in a consumer
   test; no code path yields prose without citations.
4. A public bind with no auth configuration refuses to boot, slugged; the
   deliberate opt-out flag boots and says what it did.
5. A serve built for audience X returns zero traces of any narrower tier
   (canary method, positive controls).

## Status against acceptance (2026-08-19 — the draft's honest ledger)

Proven live: the three tools through a real MCP client over stateless HTTP against
Postgres; the typed abstention under a calibrated floor (including the
question whose only passing answer is the abstention); snapshot pinning +
the refresh path; byte-exact read; the HTTP door's fail-closed boot and
probes; oracle-fixture parity for chunking, calibration math, windowing,
manifest; and the calibrate CLI's synthesized door (`calibrateCommand` builds
the text generator and passes it into `runCalibration` — corrected 2026-08-20:
this spec listed it as unwired after the code landed; the code wins). Not yet
wired: the visibility-staged tier as serve's source (clause above is contract,
not behavior), behavioural evals as a CI gate, and the `.mcp.json` scaffold
rung.
The "declared-but-uncalibrated refuses" invariant is now REPRESENTABLE and
enforced (`retrieval.vector_floor: uncalibrated` refuses every serve —
resolved 2026-08-19), so the grammar is no longer a two-state gap. It also
covers a floor that WAS measured but not through this predicate
(`retrieval.floor_digest`, 2026-08-25).

**What an arm admits** (record spec §2.4/§2.5, decision 26): the audience
overlap, the lifecycle window and the trust floor compose into one admitted
set bound beside the takedown denial in search's two arms, read, outline and
the calibration sampler. A section declares no governance of its own and is
admitted iff a descendant is visible, by a recursive `parent_id` walk. The
caller's trust floor is `ServiceContext.minTrustTier` (0 unverified, 1
machine-confirmed, 2 human-reviewed; absent = 0), and the door exposes it as
`search`'s `min_trust_tier`. The deployment's own floor is
`KSOR_MIN_TRUST_TIER`; the two compose by the higher of the pair, so
configuration TIGHTENS and a request never loosens. The default and the
enforcement live in the HANDLER, not in the adopter-owned registration
(decision 23), so a registration emitted before the parameter existed keeps
working and the boot inspection NOTICES the absence rather than refusing it.

**Every hit AND every `read` carries its governance**: `status`, `trust_tier`, the latest
`verified` act (or null), `effective_from`, `stale_after`, and `approval` with
`checked: "policy"` — honest absence in the envelope's own idiom, exactly as
`gate: "off"` is: the approver was checked against the Governance Policy's
authority list and NOT against change control, which is phase B. It travels
with the PASSAGE, because an agent deciding whether to rely on a sentence is
deciding about the document it came from, and a per-response summary cannot
say which of several hits was the reviewed one. `read` carries the same block,
from the same six columns through the same seam, taken from the LIVE node row
rather than a pinned one — a snapshot exists so a citation keeps resolving to
the same bytes, never so the record's position on those bytes is frozen too.

**`read` returns the concept's frontmatter byte-exact** — the author's bytes
from `sources.frontmatter`, never a re-serialisation of the parsed columns:
the profile preserves unknown keys, so a re-rendered block would hand an agent
a document the record does not contain. It is UNTRUSTED corpus text, and it
sits beside `governance`, which is not: the frontmatter is what the author
DECLARED, `governance` is what the record checked and stored. Offering only the
authored block on the surface an agent reads documents from would invite it to
read a declaration as a verification, so both go out and the floor says which
is which. The in-band injection advisory is computed over BOTH channels.

**`read` and `outline` take no per-call trust floor** — deliberately, for now.
The deployment's floor binds every arm including theirs, so neither can serve
past `KSOR_MIN_TRUST_TIER`; what a caller cannot yet do is tighten on those two
the way `search` lets it. With `governance` on the read reply the agent can see
the tier it got and decide, which is the honest half; the parameter is
worth adding when a caller has a reason to make the door refuse instead. An
`outline` row carries no governance at all — it is a title and a path, not a
claim — and that is the sharper open question, because an agent choosing what
to read from an outline has no trust signal to choose by.

**Every serving act's `retrieval_log` row records its scope**: the viewer list,
the trust floor that applied, whether it abstained, how many results it
returned (`result_count` — one name for that fact across every action), and the
generation. Never content and never the query — telemetry
that accumulated passages would be a second copy of the record with no
audience predicate over it and no takedown seam bound to it.

## Out of scope

Answer synthesis inside serve (the caller is the model); `ksor dev`
(re-evaluated after serve exists); multi-instance bundle transport unless
its decision-6 gate answers what it is for here; per-request visibility
filtering (its own spec, on a named trigger).
