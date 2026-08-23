---
"@panaversity/ksor": patch
---

Bound the container image: `.dockerignore` now denies everything and allows only
what the door needs.

The previous shape listed what to exclude, which cannot bound an image — it can
only exclude what someone thought of. A build output, a cache, a vendored
dependency or a backup directory in the project root all rode in, and the failure
arrived as a container registry rejecting the push (`PAYLOAD_TOO_LARGE`) rather
than as anything about the file that was added.

Now: `*`, then `!package.json`, `!instance.md`, and `system/gateways/` — this
door's own MCP registration. Everything else stays out, including the corpus (the
door serves from Postgres), the website (a separately hosted surface), and every
`.env` (a DSN baked into a layer is published to anyone who can pull the image).

The container acceptance job now reports the built image's size and fails past a
ceiling, so an allow-list that stops bounding it goes red here rather than at
someone's deploy.
