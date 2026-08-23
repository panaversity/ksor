---
"@panaversity/ksor": patch
---

The emitted `Dockerfile` names the files it copies instead of `COPY . ./`.

**A `.dockerignore` is not honoured by every build host.** Vercel's container
builder ignores it, so `COPY . ./` swept in `node_modules` and the built site —
about a gigabyte — and the deploy failed with the registry rejecting the push as
`PAYLOAD_TOO_LARGE`. The error arrives from the host and says nothing about the
file that caused it.

Naming what enters the image is the only form portable across build hosts. The
`.dockerignore` stays as defence in depth for builders that do respect it, but it
is no longer what bounds the image.

The risk of naming files is forgetting one — which is exactly how the registration
file came to be missing from the image two releases ago. That is covered: the
container acceptance job boots the built image and asserts it serves the tools the
registration names, so a forgotten file fails there rather than at a deploy.
