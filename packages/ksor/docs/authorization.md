---
title: Authorization
status: draft
---

# Putting the record behind an authorization server

`ksor serve` refuses to boot unauthenticated on a public bind. That is the whole
posture, and it means the last step of a deployment is standing up an
authorization server and pointing the door at it.

This page is two worked recipes, both executed against real servers rather than
written from their documentation, plus what an agent does to obtain a token. The
mechanism is standard OAuth 2.0 — nothing here is specific to either product, and
that is the point: two different implementations are shown because a single one
proves nothing about neutrality.

## What the door needs

Three variables, and one more you should set even though it is optional:

| variable                     | what it is                                                                    | where the value comes from                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `KSOR_SSO_URL`               | your authorization server's base URL                                          | the AS itself; for OIDC it is the issuer, the URL whose `/.well-known/openid-configuration` answers |
| `KSOR_MCP_RESOURCE_URL`      | **this record's** canonical URL — the identifier a token must be audienced at | you choose it; it is the public URL agents reach the door on                                        |
| `KSOR_JWT_ALLOWED_AUDIENCES` | which audiences are accepted, comma-separated                                 | normally exactly `KSOR_MCP_RESOURCE_URL`                                                            |
| `KSOR_SSO_ISSUER`            | the issuer to enforce                                                         | the `issuer` field of the AS's discovery document                                                   |

`KSOR_MCP_RESOURCE_URL` is **not** a place the door fetches anything from. It is
the name of this resource, in the RFC 8707 sense: a token minted for a different
resource is refused even when the signature is perfect and the issuer is right.
That is what stops a token issued for some other service being replayed at your
record.

The door finds the signing keys by discovery, in this order, and says at boot
which one it used:

```
1. KSOR_JWKS_URL                        you stated the URI outright
2. /.well-known/oauth-authorization-server   RFC 8414 metadata
3. /.well-known/openid-configuration         OIDC discovery
4. <KSOR_SSO_URL>/api/auth/jwks              a vendor default, reported as a GUESS
```

**Set `KSOR_SSO_ISSUER`.** Without it, a token from a _different_ authorization
server produces an unknown key id, which is indistinguishable from key-rotation
lag — so the door answers `503`, the client retries a credential that can never
work, and a misconfiguration reads as an outage. With the issuer declared, that
same token is refused `401` before any key is fetched.

## Recipe: Keycloak

Run it:

```sh
docker run -d --name kc -p 8180:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:26.0 start-dev
```

Get an admin token, then create a client for the agent. `client_credentials` is
the machine-to-machine shape — an agent is not a person and has no browser:

```sh
KC=http://127.0.0.1:8180
ADM=$(curl -s -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d client_id=admin-cli -d username=admin -d password=admin -d grant_type=password \
  | jq -r .access_token)

curl -s -X POST "$KC/admin/realms/master/clients" -H "Authorization: Bearer $ADM" \
  -H 'Content-Type: application/json' -d '{
    "clientId":"ksor-agent","protocol":"openid-connect","publicClient":false,
    "serviceAccountsEnabled":true,"standardFlowEnabled":false,"secret":"agent-secret"}'
```

Keycloak does not put your resource in the token's `aud` on its own. Add an
audience mapper — this is the step people miss, and its absence looks exactly
like a rejected token:

```sh
CID=$(curl -s "$KC/admin/realms/master/clients?clientId=ksor-agent" \
  -H "Authorization: Bearer $ADM" | jq -r '.[0].id')

curl -s -X POST "$KC/admin/realms/master/clients/$CID/protocol-mappers/models" \
  -H "Authorization: Bearer $ADM" -H 'Content-Type: application/json' -d '{
    "name":"ksor-resource-audience","protocol":"openid-connect",
    "protocolMapper":"oidc-audience-mapper",
    "config":{"included.custom.audience":"https://records.example.com/mcp",
              "access.token.claim":"true"}}'
```

Point the door at it:

```sh
export KSOR_SSO_URL=http://127.0.0.1:8180/realms/master
export KSOR_SSO_ISSUER=http://127.0.0.1:8180/realms/master
export KSOR_MCP_RESOURCE_URL=https://records.example.com/mcp
export KSOR_JWT_ALLOWED_AUDIENCES=https://records.example.com/mcp
ksor serve --instance instance.md
```

The boot block tells you whether discovery worked:

```
auth     bearer tokens, verified against the record's authorization server
keys     openid-configuration — http://127.0.0.1:8180/realms/master/protocol/openid-connect/certs
```

If that line says `guess` instead of naming a discovery document, the AS did not
publish metadata where the door looked, and you should set `KSOR_JWKS_URL`
yourself rather than rely on the vendor default.

## Recipe: Ory Hydra

A different implementation, and a different way of asking for the audience —
which is the neutrality proof. Hydra takes the RFC 8707 `audience` parameter on
the token request, so no mapper is involved:

```sh
docker run -d --name hydra -p 4444:4444 -p 4445:4445 \
  -e DSN=memory -e URLS_SELF_ISSUER=http://127.0.0.1:4444 \
  -e SECRETS_SYSTEM=change-me-0000000000000000000000 \
  -e STRATEGIES_ACCESS_TOKEN=jwt \
  oryd/hydra:v2.2.0 serve all --dev

curl -s -X POST http://127.0.0.1:4445/admin/clients -H 'Content-Type: application/json' -d '{
  "client_id":"ksor-agent","client_secret":"agent-secret",
  "grant_types":["client_credentials"],"token_endpoint_auth_method":"client_secret_post",
  "audience":["https://records.example.com/mcp"],"access_token_strategy":"jwt"}'
```

Only the two SSO variables change:

```sh
export KSOR_SSO_URL=http://127.0.0.1:4444
export KSOR_SSO_ISSUER=http://127.0.0.1:4444
```

Hydra publishes its keys at `/.well-known/jwks.json` rather than Keycloak's
`/protocol/openid-connect/certs`. Nothing in ksor knows that; discovery reads it
from the metadata document, which is why the door works against both unmodified.

## What an agent does

Ask the token endpoint for a token audienced at the record, then send it as an
ordinary bearer:

```sh
# Hydra — the audience is a request parameter
curl -s -X POST http://127.0.0.1:4444/oauth2/token \
  -d grant_type=client_credentials -d client_id=ksor-agent -d client_secret=agent-secret \
  -d audience=https://records.example.com/mcp

# Keycloak — the audience comes from the mapper, so the request is plain
curl -s -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d client_id=ksor-agent -d client_secret=agent-secret -d grant_type=client_credentials
```

With the MCP TypeScript SDK:

```ts
const transport = new StreamableHTTPClientTransport(new URL("https://records.example.com/mcp"), {
  requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
});
```

A client that does not know where to authenticate can find out: an unauthorized
request answers `401` with a pointer to this record's metadata, per RFC 9728.

```
www-authenticate: Bearer resource_metadata="https://records.example.com/.well-known/oauth-protected-resource/mcp"
```

## What the door refuses, and how it says so

| what you send                                                    | answer                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| no token                                                         | `401`, with the `resource_metadata` pointer                                 |
| a malformed or unsigned token                                    | `401`, `error="invalid_token"`                                              |
| a token for a **different resource**                             | `401` — the audience binding, and the reason it exists                      |
| a token from a **different issuer** (with `KSOR_SSO_ISSUER` set) | `401`, before any key is fetched                                            |
| a token from a different issuer (issuer NOT set)                 | `503` — indistinguishable from rotation lag, which is why you should set it |
| an expired token                                                 | `401`                                                                       |
| a valid token                                                    | the record answers, and the answer carries its citations                    |

A genuine key-rotation lag stays a `503` on purpose: it is transient, retrying is
the right response, and the refusal is never cached — a valid bearer is
re-admitted the instant the key set catches up.

## Before a public bind

- Auth configured as above, **or** `KSOR_AUTH=disabled-public` set
  deliberately — the door will not come up on a public address without one of
  them, and the second is a decision, not a default.
- `KSOR_ALLOWED_HOSTS` set to the host you serve on.
- `KSOR_SNAPSHOT_KEYS` shared across every replica. Unset means a key per
  process, so a citation minted by one replica fails on another.
