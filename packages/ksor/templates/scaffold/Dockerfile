# The MCP door, as an ordinary container.
#
# Nothing here names a host. It installs the pinned `@panaversity/ksor` from
# package.json, listens on $PORT, and runs `ksor serve` — which is all Cloud Run,
# Fly, Render, ECS, Kubernetes or a plain VPS asks for. `vercel.json` points AT
# this file rather than replacing it, so the artifact stays portable and the host
# stays a choice.
#
# Build and run it anywhere:
#   docker build -t my-record .
#   docker run --rm -p 8080:80 --env-file .env my-record
#
# This image serves; it does not publish. `ksor ingest` is a write plane that
# runs from CI or your machine against the same database — see the deployment
# guide in node_modules/@panaversity/ksor/docs/deploying.md.

FROM node:24-alpine

WORKDIR /app

# Only the manifest first, so this layer caches until the ksor pin changes.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# The record's identity, configuration, and its MCP registration
# (system/gateways/). What is deliberately ABSENT is decided in .dockerignore —
# the corpus, the website and every secret — rather than by listing files here:
# naming them one at a time is how the door came to ship without the very file
# that shapes its tool surface (found live).
COPY . ./

# Most container hosts inject PORT; 80 is a sane default when nothing does.
ENV PORT=80
EXPOSE 80

# `ksor serve` refuses to boot unauthenticated on a public bind. That posture
# belongs to the record, not to the host, so it travels inside the image.
CMD ["node_modules/.bin/ksor", "serve", "--instance", "instance.md"]
