---
"@panaversity/ksor": patch
---

Say what the scaffold's `.mcp.json` attaches to an adopter's coding agent, and
stop the README telling them to destroy it.

`ksor init` emits `.mcp.json` with two servers. The emitted README and AGENTS.md
both said "the first is Neon" and named the second nowhere — so
`agentfactory-system-of-record`, a Panaversity-operated endpoint, was wired into
every adopter's coding agent with no emitted document mentioning it. `.mcp.json`
attaches servers to the agent that OPERATES the record; a server nobody
documented is a capability nobody reviewed.

Both are now named, with what each is and that either may be deleted. The second
is described as what it is: a read-only example record that is **not** the
adopter's and that nothing in the project depends on.

The Neon step also said only that the server exists. It acts on the Neon
_account_ — an agent holding it can create and delete projects and branches — so
the README and AGENTS.md now say that before handing over a prompt that runs
against real infrastructure, and point at Neon's own documentation for the
scopes rather than paraphrasing them.

And the "Test the door with an actual agent" section told the adopter to _write_
`.mcp.json` with a file containing only `test-record` — overwriting the Neon
entry the same README depends on two sections earlier — and then closed with
"Delete `.mcp.json`, or keep it". It now shows the entry to **add**, and says not
to delete the file.

A guard derived from `mcp.json` itself asserts every server key appears in both
emitted documents, so adding a server and saying nothing fails on the server
that was added. Mutation-tested: unnaming the second server turns both red.

Found by an adversarial review of this week's commits. Whether the scaffold
should ship a second, vendor-operated MCP record at all is an owner question and
is untouched here.
