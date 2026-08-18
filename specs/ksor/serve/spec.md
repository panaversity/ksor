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

**The envelope is a discriminated union.** `{ ok: true, results, citations,
generation } | { ok: false, reason: "abstained" }` — abstention is a type a
caller branches on at compile time, never a phrasing. Every citation carries
the generation; a surface refuses content whose generation is not published
(the generation is the authorization).

**Abstention is the retrieval gate.** A declared floor below which serve
answers "not in this corpus" — a correct answer, never an error, never a
licence to fall back on model knowledge. A declared-but-uncalibrated floor
refuses to serve; a record that declares no floor has the gate off and the
surface says so (uncalibrated — will not refuse out-of-corpus questions).
Floors are calibrated per corpus per embedding space by the converted
calibrate method, human-ratified into instance.md, measurement and door
recorded beside the number.

**Serving fails safe** (decision 7). Local serve binds loopback with auth
off. A public bind refuses to boot unless auth is configured or
unauthenticated serving is explicitly flagged — a dropped auth variable must
never silently ship an open door. Transports: stdio for local agents (the
scaffold's `.mcp.json` rung) and stateless Streamable HTTP for hosting.

**Visibility.** Serve reads the staged tier of the audience it is built
for — the same seam and five guarantees as the site shells
(`specs/ksor/visibility/spec.md`). Nothing outside the tier is on disk for
any tool to return.

**Errors are documentation.** Refusals exit 1 with a stable first-line slug
and a remedy; environment failures exit 3; until implemented, `ksor serve`
keeps exiting 2 honestly.

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

## Out of scope

Answer synthesis inside serve (the caller is the model); `ksor dev`
(re-evaluated after serve exists); multi-instance bundle transport unless
its decision-6 gate answers what it is for here; per-request visibility
filtering (its own spec, on a named trigger).
