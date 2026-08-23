---
"@panaversity/ksor": patch
---

Fix the container serving the DEFAULT tool surface while the repository said
otherwise.

`.dockerignore` excluded all of `system/` — correct when that directory held only
the website, and wrong the moment the door's own registration moved into
`system/gateways/`. The file never reached the image, so a record that had
renamed its tools, dropped one, or written what it covers was deployed serving
none of it. Nothing went red: the door booted, `/health` was green, searches
returned cited hits, and only `tools/list` betrayed it.

It now excludes `system/site/`, and the Dockerfile copies the project rather than
naming files one at a time — which is how the door came to ship without the very
file that shapes its tool surface.

The container acceptance job now writes a customized registration before building
the image and asserts the served tool is the one that file names. Found by
deploying and looking at `tools/list`, which is the only thing that would have.
