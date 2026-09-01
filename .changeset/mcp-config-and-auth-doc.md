---
"@panaversity/ksor": patch
---

Two things: a false claim removed from a shipped page, and the scaffold gains
`.mcp.json`.

**The false claim.** `docs/deploying.md` told adopters "The MCP surface already
applies the audience scope **per request**", under the heading of the very
requirement it does not meet. It does not: `content-gateway/src/compose.ts`
reads `KSOR_AUDIENCE` from the environment once at boot into a per-process
viewer, and the request path never touches it — `docs/authorization.md` says so
plainly ("Any caller holding a valid token gets the whole record") and
`specs/ksor/serve/spec.md` names per-request visibility filtering as out of
scope. A reader who believed the page would point every caller at one door and
serve them the restricted half. The page now says what the door does — one
viewer per door, so one process per audience — and separates the audit it does
give (a `retrieval_log` row naming the verified caller) from the authorization
it does not. A docs-truth assertion now fails on the claim itself, not merely on
a command that no longer exists.

**`.mcp.json`.** The scaffold's closed root set gains one member: the MCP
servers a coding agent may reach from the project. It ships with Neon's, which
turns the step the tool could never do for an adopter — provision a Postgres,
enable pgvector, produce a connection string — into four real tool calls
(`create_project`, `run_sql`, `create_branch`, `get_connection_string`) and one
sentence to the agent. The scaffold's README and AGENTS.md carry that sentence,
and both now say plainly which step no agent can do at any price: the embedding
API key, which no vendor mints over a protocol. Committed rather than ignored,
because both entries authenticate interactively and the file carries no secret —
stated, because pasting an API key into it would change that.
