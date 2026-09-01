---
"@panaversity/ksor": patch
---

The deploy runbook stops ruling out the one step Vercel calls required.

`docs/deploying.md` said the silent-404 failure "does not depend on the
Application Preset". Vercel's own guide says the opposite: a project builds as
services only when the preset is `Services` AND `vercel.json` carries a
`services` key, and "if either is missing, Vercel falls back to its default
framework detection and ignores your services configuration" — which is that
failure exactly, and no file in the repository can set a project setting.

One measurement of ours disagrees with that guide and is recorded rather than
reconciled: two projects read back from the API, one `Services` and one `Other`,
both built and served. Both facts are real; guessing between them is what
produced the sentence that steered adopters away from the fix.

The scaffold's runbook now sets the preset at step 2, and ends with the three
curls that tell a live deployment from a Ready-and-404 one — `/mcp` answering
405 is the door refusing a GET, which is how you know it is routed at all.
