---
title: Authorization
status: draft
---

# Putting the record behind an authorization server

`ksor serve` refuses to boot unauthenticated on a public bind. That is the whole
posture, and it means the last step of a deployment is standing up an
authorization server and pointing the door at it.

This page is four worked recipes, all executed against real servers rather than
written from their documentation, plus what an agent does to obtain a token. The
mechanism is standard OAuth 2.0 — nothing here is specific to any one product,
and that is the point: four different implementations are shown because a
single one proves nothing about neutrality. Two are self-hosted (one `docker
run` each, no account), one is a hosted commercial provider with a free tier,
and one is an organization's own SSO — which is the case that matters most,
because it is the one where no vendor is involved at all.

The claim they exist to support is narrow and testable: **moving between
authorization servers is an environment change, not a code change.** Three
variables point at a different provider and the door does not know the
difference — no rebuild, no redeploy of the container, and the two audience
variables do not even change, because they describe your record rather than
the provider.

## What this protects — and what it does not

Read this before spending an afternoon on a provider's console.

**It protects the MCP door, not the website.** Everything on this page is a
bearer token on `POST /mcp`. Your static site is a separate surface, served by
whatever hosts it, and configuring auth here leaves it exactly as public as it
was. Keeping people out of the SITE is a different mechanism and is not on this
page — see "Keeping people out of the site" in
[deploying.md](./deploying.md), which covers the three shapes: a host-level gate
in front of everything, per-audience builds for a restricted subset, and why the
per-request case needs a decision first.

**It is one gate, not per-user rules.** The door checks that a token was signed
by the issuer you named and audienced at this record. It reads no scopes, no
roles, no groups. **Any caller holding a valid token gets the whole record**, to
the extent its audience list allows. If different readers must see different
documents, that is the record's audience model — the registry in
`.ksor/governance.yaml`, each concept's `ksor.audience` list, and the viewer
list the door is configured for — and it is a different mechanism from this
page. See the scaffold's AGENTS.md.

So: this page answers _"can a stranger read my record over MCP?"_ It does not
answer _"can Alice read what Bob can."_

## What the door needs

**Three** variables turn auth on. The rest are hardening: add them once it
works, not while you are trying to make it work.

| variable                     | what it is                                                                    | where the value comes from                                       |
| ---------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `KSOR_SSO_URL`               | your authorization server's base URL, used to FIND its metadata document      | the AS itself                                                    |
| `KSOR_MCP_RESOURCE_URL`      | **this record's** canonical URL — the identifier a token must be audienced at | you choose it; it is the public URL agents reach the door on     |
| `KSOR_JWT_ALLOWED_AUDIENCES` | which audiences are accepted, comma-separated                                 | normally exactly `KSOR_MCP_RESOURCE_URL`                         |
| `KSOR_SSO_ISSUER`            | the issuer to enforce                                                         | the `iss` claim of a real token — see below                      |
| `KSOR_ALLOWED_HOSTS`         | Host header allow-list, comma-separated `host:port` (bare host on 80/443)     | the hostname you serve on                                        |
| `KSOR_SNAPSHOT_KEYS`         | `kid=secret[,kid2=secret2]`, first active; identical on every replica         | `openssl rand -hex 32` — used as literal text, never hex-decoded |

**First, delete `KSOR_AUTH` if it is set.** It is the _auth-off_ posture —
`disabled-local` for a loopback dev run, `disabled-public` to serve the record
to anyone who can reach the port — and it wins over everything below. A scaffold
ships with `KSOR_AUTH=disabled-local` in its `.env.example`, so a deployment
that copied that file has it set and will stay unauthenticated no matter how
carefully you configure the variables above. Configuring the SSO door is
what turns auth **on**; removing `KSOR_AUTH` is what stops it being off.

Every variable here is read from the environment of the `ksor serve` process —
your host's environment panel, or a `.env` beside `instance.md`. **Changing any
of them requires restarting the door**; nothing is re-read at runtime.

`KSOR_MCP_RESOURCE_URL` is this record's **name**, in the RFC 8707 sense: a
token minted for a different resource is refused even when the signature is
perfect and the issuer is right. That is what stops a token issued for some
other service being replayed at your record.

**Use the real URL agents reach the door on.** Your authorization server never
fetches it — but a CLIENT does. An unauthorized request answers `401` with
`www-authenticate: Bearer resource_metadata="…"`, and the client follows that to
a document the door serves at its own host. Invent a value that does not resolve
and the boot report will still look green while every standards-following client
fails to discover where to authenticate.

The door finds the signing keys by discovery, in this order, and says at boot
which one it used:

```
1. KSOR_JWKS_URL                        you stated the URI outright
2. /.well-known/oauth-authorization-server   RFC 8414 metadata
3. /.well-known/openid-configuration         OIDC discovery
4. <KSOR_SSO_URL>/api/auth/jwks              Better Auth's layout, reported as a GUESS
```

**`KSOR_SSO_URL` and `KSOR_SSO_ISSUER` are different strings, and often differ
by a trailing slash.** The first is a base that paths are joined onto; the
second is compared **byte-exact** against the token's `iss` claim. Setting both
to the same value is the commonest cause of a 401 on a perfectly good token.
Mint one token, decode it, and copy `iss` out of it verbatim.

**`KSOR_SSO_ISSUER` is optional, and you cannot set it correctly until auth
already works** — it comes from a token you must first be able to mint. Get the
three required variables working, decode a token, then add it. Unset, the issuer
is simply not checked (`auth.ts:398`); the signature, the audience and the
expiry all still are, and audience binding is what actually refuses a foreign
token.

What it buys is a better ERROR. Without it, a token from a _different_ authorization
server produces an unknown key id, which is indistinguishable from key-rotation
lag — so the door answers `503`, the client retries a credential that can never
work, and a misconfiguration reads as an outage. With the issuer declared, that
same token is refused `401` before any key is fetched.

## Connecting an assistant — the way most people will use this

The recipes below all end in a token you fetch with `curl`. That proves the door
verifies tokens, and it is not what you actually want: you want to open an
assistant and have it read your record. That path is the same for every provider,
so it is written once, here.

**What it needs from your provider — one browser client, separate from any
machine one.** A `client_credentials` application has no browser and no redirect;
filling in its callback field changes nothing. Create a second client that does
`authorization_code`, and set its callback to the one your assistant uses. For
Claude's hosted surfaces:

```
https://claude.ai/api/mcp/auth_callback
```

Then **authorize that client for your record's resource**. Every provider spells
this differently — Auth0 calls it Application Access, Keycloak grants it through
scope and audience mapping — and it is the step that most often looks done and
is not. Skipping it gives an error at the authorization endpoint rather than at
the token endpoint, so the login never even reaches your record:

```
Client "…" is not authorized to access resource server "https://your-host/mcp"
```

Finally, add the connector: the door's URL (`https://your-host/mcp`), plus the
browser client's ID and secret. Those credentials go **into the assistant**,
never into ksor — the door holds no client credentials and cannot mint a token
for itself.

**What you should see.** The assistant sends you to your provider's login page,
you sign in, and it returns with the record's tools available. If instead you get
a 401 from the door after a successful login, decode the token and compare `aud`
against `KSOR_MCP_RESOURCE_URL` before looking anywhere else — that is the one
failure that looks like a broken server and is a mismatched name.

Standards-following clients send RFC 8707 (`resource=https://your-host/mcp`) on
the authorization request, so a provider that honours it needs no vendor-specific
audience parameter and no mapper.

## Will your provider work? Three questions, before you start

Answer these before creating anything. A provider that fails any one of them
cannot be used, and you will not discover that until you are several screens
into its console.

**1. Does it issue RS256 JWTs, not opaque tokens?**
The door verifies signatures itself (`algorithms: ["RS256"]`) and makes **no
introspection call** — there is no code path that asks your provider whether a
token is good. An opaque token it cannot read is a token it must refuse.

**2. Does it publish a metadata document?**
Keys are DISCOVERED, in this order: `KSOR_JWKS_URL` if you set it, then RFC 8414
(`/.well-known/oauth-authorization-server`), then OpenID Discovery
(`/.well-known/openid-configuration`). Any standards-compliant authorization
server advertises `jwks_uri` in one of those. If yours publishes neither, you
must supply `KSOR_JWKS_URL` yourself and hope it is stable.

**3. Can it mint a token audienced at YOUR identifier?**
Either through RFC 8707 (`resource=https://your-host/mcp` on the authorization
request) or a vendor parameter (`audience=` on Auth0, an audience mapper on
Keycloak). A provider that only ever issues tokens audienced at its own userinfo
endpoint cannot express "this token is for that record", and audience binding is
the whole point of the resource-server posture.

### A provider that fails these

Products built for **user sessions in your own app** frequently do. Their
machine-to-machine tokens are minted and verified by calling _their_ backend —
opaque by default, no OAuth token endpoint taking a custom audience, no metadata
document. That is a coherent design; it is simply a different one, and adapting
it means writing the verification layer ksor already is.

The four recipes below all pass. If yours does too, they will read as the same
recipe with different button names — because underneath they are.

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

## Recipe: Auth0

A hosted provider with a free tier, and the one whose vocabulary causes the most
trouble — so this recipe is written around the confusions rather than around the
happy path. Every step below is one that was got wrong first, on a real tenant.

**Auth0's "API" is your ksor door. Auth0's "Application" is whoever calls it.**
Nothing else in this recipe makes sense until that lands. You are not building
an API; you are describing the one you already have so Auth0 can mint tokens
aimed at it.

**You will need MORE THAN ONE Application, and they are different types.** This
is the single thing most likely to waste your afternoon, because one application
configured for one caller returns a plain `401` to the other with nothing
naming the mismatch (found the hard way, 2026-08-26). One API, one caller per
row:

| The caller                                        | Auth0 Application Type      | Token endpoint auth        | Callback                                                            | Needs step 5 |
| ------------------------------------------------- | --------------------------- | -------------------------- | ------------------------------------------------------------------- | ------------ |
| the SITE's sign-in control (`NEXT_PUBLIC_KSOR_*`) | **Single Page Application** | **None** — PKCE, no secret | `https://your-site/auth/callback`                                   | no           |
| an assistant a person logs into (Claude, an IDE)  | **Regular Web Application** | client secret              | the assistant's own, e.g. `https://claude.ai/api/mcp/auth_callback` | **yes**      |
| a script, worker or backend agent                 | **Machine to Machine**      | client secret              | none                                                                | **yes**      |

The site row is a different flow and not really part of this page: it requests
`openid profile email` and **no audience**, so it never touches your API and
needs no grant. It is here only so you do not try to serve it and an assistant
from one application — a public client with no secret and a confidential client
that sends one cannot be the same registration, and the failure is a `401` at
the token endpoint that says nothing about why.

### 1. Describe the door

**Applications → APIs → Create API.** The **Identifier** you type becomes the
audience — use your record's MCP URL. It is a name, not a fetch target; it never
has to resolve.

```
Name:       my-record
Identifier: https://your-host.example.com/mcp
```

**Type the whole URL, `/mcp` included, and get it right the first time.** The
Identifier must equal `KSOR_MCP_RESOURCE_URL` character for character — the host
alone is not enough, because that is not what the door will compare against. And
**Auth0 does not let you edit an Identifier after the API is created**: a wrong
one is fixed by creating a NEW API with the right string and granting your
application access to that one instead.

Two Auth0 errors tell you exactly where you are, and they are easy to confuse
because both arrive as a failed token request (reported by an adopter,
2026-08-26):

| Auth0 says                                                               | Means                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `Service not enabled within domain: https://…/mcp`                       | **no API has that Identifier.** Yours was created with a different string — make a new one |
| `Client "…" is not authorized to access resource server "https://…/mcp"` | the API is right and the **grant** is missing — step 5                                     |

Moving from the first message to the second is progress, not a new problem.

Creating it also creates a machine-to-machine **test application** named
`<API> (Test Application)`. That is your first caller — you do not need to make
one.

### 2. Point the door at the tenant

```sh
KSOR_SSO_URL=https://YOUR_TENANT.us.auth0.com
KSOR_SSO_ISSUER=https://YOUR_TENANT.us.auth0.com/
KSOR_MCP_RESOURCE_URL=https://your-host.example.com/mcp
KSOR_JWT_ALLOWED_AUDIENCES=https://your-host.example.com/mcp
```

**Mind the trailing slash on the issuer.** Auth0's `iss` carries one and
`KSOR_SSO_URL` does not; they are deliberately different strings. Copy `iss`
out of a real token rather than typing it.

**Delete any `KSOR_AUTH`.** Configuring the SSO door is what turns auth on;
leaving a disabled posture set keeps it off no matter what else is configured.

### 3. A scripted caller (machine-to-machine)

The test application already works **for this grant only** — creating the API
authorized it. Do not read that as permission to skip step 5: any application
you create yourself starts unauthorized, and that is where the next hour goes.

Its credentials live under
**Applications → Applications → `<API> (Test Application)` → Settings**.

```sh
curl -s -X POST https://YOUR_TENANT.us.auth0.com/oauth/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"…","client_secret":"…",
       "audience":"https://your-host.example.com/mcp"}'
```

### 4. An interactive caller (a person, through a browser)

An assistant that logs a human in needs a **different application**, because a
machine-to-machine application has no browser and no redirect — filling in its
callback field changes nothing.

**Applications → Create Application → Regular Web Application**, then on it:

- **Allowed Callback URLs**: the client's callback. For Claude's hosted
  surfaces that is `https://claude.ai/api/mcp/auth_callback`.
- **Save Changes** — the button is at the very bottom and nothing autosaves.

Its **Client ID and Secret go into the client**, not into ksor — the connector
form of whatever assistant you are configuring. The door never holds client
credentials and cannot mint a token for itself; it only verifies what it is
handed. Then do step 5, or the login will succeed and the token request will
not.

### 5. Authorize the caller for the door — the step that hides

A new application is not allowed to request your API. Auth0 refuses with:

```
Client "…" is not authorized to access resource server "https://your-host.example.com/mcp"
```

The fix is on the **API**, not the application, and **it is not a toggle**:

**APIs → your API → Application Access → find the application → `Edit` →
`Grant Access`.**

The greyed pills in that table are progress bars. The control is inside the side
panel the `Edit` button opens, and `Grant ID: No per-app authorization grant`
underneath confirms whether one exists.

Pick the right column:

| column                    | grant                | used by                                   |
| ------------------------- | -------------------- | ----------------------------------------- |
| **User-delegated Access** | `authorization_code` | an assistant acting as a signed-in person |
| **Client Access**         | `client_credentials` | a script, worker or backend agent         |

An application needs only the one it uses. Granting also ticks **"Always grant
all permissions"**, which matters only if you later add scopes to this API —
ksor checks issuer and audience, never scopes.

### What Auth0 gets right

It honours RFC 8707. An MCP client sending
`resource=https://your-host.example.com/mcp` gets a token audienced there, with
no `audience=` parameter and no mapper — which is why the authorization request
works unmodified once the grant exists.

## Recipe: Better Auth

The simplest of the four, and the one the door was originally written against —
the JWKS fallback in `auth.ts` is Better Auth's layout (`/api/auth/jwks`), which
is why an unconfigured `KSOR_JWKS_URL` still finds keys on a Better Auth
deployment even if discovery never runs.

It is also the only recipe here with **no client secret**, because a static
public client with PKCE is enough:

```sh
KSOR_SSO_URL=https://auth.your-org.example
KSOR_MCP_RESOURCE_URL=https://your-host.example.com/mcp
KSOR_JWT_ALLOWED_AUDIENCES=https://your-host.example.com/mcp
```

Three variables, no fourth. Register one OAuth client with:

- **PKCE required**, `token_endpoint_auth_method: none` — a public client, so
  there is no secret to distribute, rotate, or leak into a config file
- the assistant's callback in its redirect list
  (`https://claude.ai/api/mcp/auth_callback` for Claude's hosted surfaces)

### Why this shape is worth preferring

**Nothing to authorize afterwards.** The step that costs an afternoon on Auth0 —
finding where a client is granted access to a resource server — does not exist
here. A registered client can request your resource.

**No dynamic client registration.** DCR is what an assistant falls back to when
you have not given it a client, and it brings its own tenant-wide toggles and
third-party permission defaults. A statically-registered public client skips all
of it.

**No secret in the assistant's config.** PKCE proves the caller is the same one
that started the flow, without a shared secret. There is simply less to get
wrong, and less to leak.

If your organization runs its own SSO, this is the shape to ask for.

## Verify it — against the door, not the provider

If you connected an assistant and it read your record, auth works — that is the
end-to-end proof and you can stop here.

Use the commands below when it did NOT work, or when the caller is a script
rather than a person. A token from your provider proves the provider works; it
does not prove the door does. Both halves matter, and the refusal matters more.

**0. Ask the provider for a token FIRST, before you touch the door.** Half the
failures on this page never reach ksor at all, and this one command separates
the two halves in a second:

```sh
curl -s -X POST https://YOUR_TENANT.us.auth0.com/oauth/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"…","client_secret":"…",
       "audience":"https://your-host.example.com/mcp"}'
```

An `error` here is the PROVIDER refusing, and no amount of ksor configuration
will change it — see the table in step 1 for what each message means. An
`access_token` here means the provider works, and anything still failing is the
door or the token's contents, which is what the rest of this section is for.

**1. Decode the token before using it.** This is the single most useful
debugging step once you have one, because a valid token audienced at the wrong
thing looks identical to a broken one:

```sh
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{iss, aud, exp}'
```

- `aud` must equal your `KSOR_MCP_RESOURCE_URL`. If it is your provider's
  `/userinfo` endpoint, the audience never carried — fix that before anything
  else.
- `iss` is what belongs in `KSOR_SSO_ISSUER`, character for character.

**2. No token must be REFUSED.** Run this first; it is the half that proves auth
is on at all:

```sh
curl -s -i -X POST https://your-host.example.com/mcp \
  -H 'content-type: application/json' -d '{}' | head -5
```

Expect `401`, and a `www-authenticate: Bearer resource_metadata="…"` header. A
`200` here means auth is off — check `KSOR_AUTH` is unset and that you restarted.

**3. A good token must be ACCEPTED:**

```sh
curl -s -X POST https://your-host.example.com/mcp \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expect the record's tools. A `401` here with a `200` above means the token is
being read and rejected — go back to step 1 and compare `aud` and `iss`.

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

## Before a public bind — recap

Everything here is stated above; it is repeated because it is the checklist you
want open while deploying.

- Auth configured as above, **or** `KSOR_AUTH=disabled-public` set
  deliberately — the door will not come up on a public address without one of
  them, and the second is a decision, not a default.
- `KSOR_ALLOWED_HOSTS` set to the host you serve on.
- `KSOR_SNAPSHOT_KEYS` shared across every replica. Unset means a key per
  process, so a citation minted by one replica fails on another.
