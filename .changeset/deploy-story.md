---
"@panaversity/ksor": patch
---

The scaffold now answers Vercel's deploy interview: a shipped
`vercel.json` declares the repo root as the deploy directory (pinning
`system/site` omits the record — the interview's natural answer breaks
the build), the static export as the deliverable, and matching trailing
slashes. The README gains a Deploying section documenting what was
always true but never written down: the built site is a folder of files
with zero host-specific dependencies — Vercel, GitHub Pages, nginx, or
`python3 -m http.server` all serve it, with `KSOR_BASE_PATH` for
sub-path hosts.
