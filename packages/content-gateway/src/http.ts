/**
 * The MCP door: the SDK v2 HTTP entry (Request → Response, stateless)
 * behind Hono, serving the 2026-07-28 revision with 2025-era clients still
 * answered through the stateless fallback. Modern exchanges are buffered JSON;
 * the legacy leg answers over SSE (the SDK's own shape) and is DRAINED here
 * before the concurrency slot is released.
 *
 * The MCP surface is the product, so the door composes the SDK's own HTTP
 * shape instead of hand-rolling routing and body parsing — the layer three
 * findings landed in.
 *
 * Contracts the hand-rolled door had earned and this one keeps (a framework
 * doesn't know them, so they are restored explicitly — review, 2026-08-19):
 * fail-soft env parsing (envInt, never `Number(env ?? default)`); the bind
 * is AWAITED so EADDRINUSE/EACCES reach the CLI exit contract, not a stack
 * trace; the boot line prints AFTER binding; SIGTERM drains the pool only
 * AFTER the listener closes; the exact HSTS contract (max-age 63072000).
 *
 * What stays ours because it is good: buildAuth and the fail-closed boot
 * posture, the three probes, the concurrency cap, the content kernel.
 */

import { serve, type ServerType } from "@hono/node-server";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  AuthConfigError,
  buildAuth,
  envInt,
  resolveBind,
  runWithIdentity,
  transportSecurityFromEnv,
  TokenVerifyError,
  type Auth,
  type VerifiedIdentity,
} from "@panaversity/ksor-gateway-kit";
import { runProbe, withProbeDeadline } from "@panaversity/ksor-content";

import { buildServer } from "./server.js";
import type { Composition } from "./compose.js";

/**
 * How long a drain may take before the process exits anyway. Long enough for a
 * real in-flight exchange and a remote pool teardown; short enough that a
 * wedged shutdown is a delay, never an orphaned server holding the port.
 */
// 8s, not 10: a container runtime that scales to zero typically allows ~10s
// between SIGTERM and SIGKILL (Cloud Run's default), so a 10s deadline lands
// exactly on the kill and never gets to run. Leave headroom for the exit.
//
// Read inside runHttp, NOT at module scope. `cli.ts` imports this module
// statically, so a module-level env read evaluates before `main()` calls
// `loadDotEnv()` — the knob would be frozen at its default and an adopter
// setting KSOR_DRAIN_TIMEOUT_MS in `.env` would silently change nothing. This
// is the same ESM-ordering trap that shipped a different setting inert in
// 0.0.4, and the two sibling knobs below (`maxBodyBytes`, `maxInflight`) are
// read inside the function for exactly this reason (round-4 review of #43,
// confirmed independently by two reviewers against the shipped bundle:
// dist/cli.mjs initialises the const ~5000 lines before loadDotEnv runs).
const drainTimeoutMs = (): number =>
  envInt(process.env, "KSOR_DRAIN_TIMEOUT_MS", 8_000, { minimum: 100 });

export interface Security {
  /** Allowed Host header values; null = do not Host-gate (public, bearer-gated). */
  readonly hosts: Set<string> | null;
  /** Allowed Origin header values; null = do not Origin-gate. */
  readonly origins: Set<string> | null;
}

/**
 * Both DNS-rebinding gates, resolved together — the Host allowlist AND the
 * Origin allowlist. transportSecurityFromEnv parses both from
 * KSOR_ALLOWED_HOSTS/ORIGINS; dropping either (or letting an origins-only
 * config fall through to the loopback Host branch, re-opening the Host hole)
 * is the bug this closes (review, 2026-08-19). Every loopback SPELLING arms
 * the Host default; a real HTTP client always sends Host, so a blank one is
 * never allowlisted.
 */
export function resolveSecurity(bind: { host: string; port: number }): Security {
  const explicit = transportSecurityFromEnv(process.env);
  const loopback = bind.host === "127.0.0.1" || bind.host === "localhost" || bind.host === "::1";
  // RFC 9110: a client OMITS the port when it is the scheme default, so on
  // :80 the Host header is bare `localhost`, not `localhost:80`. A
  // port-qualified allowlist alone therefore 421s EVERY request on a legal
  // KSOR_MCP_PORT=80 — a total outage from a valid setting (review,
  // 2026-08-20). Allow both spellings; on any other port only the qualified
  // form is legal, so nothing is widened.
  const bare = bind.port === 80 || bind.port === 443;
  const loopbackHosts = new Set([
    `127.0.0.1:${bind.port}`,
    `localhost:${bind.port}`,
    `[::1]:${bind.port}`,
    ...(bare ? ["127.0.0.1", "localhost", "[::1]"] : []),
  ]);
  // On a loopback bind, ORIGIN is gated by default — not only when
  // KSOR_ALLOWED_ORIGINS is set. This is the exact target of the MCP spec's
  // Origin-validation MUST (a local server, auth off), and the SDK's own gate
  // is NOT armed by this composition. A non-browser client (a coding agent)
  // sends no Origin and passes; a DNS-rebinding browser request carries a
  // cross-origin Origin and is refused (review 2026-08-19).
  const loopbackOrigins = new Set([
    `http://127.0.0.1:${bind.port}`,
    `http://localhost:${bind.port}`,
    `http://[::1]:${bind.port}`,
  ]);
  if (explicit === null) {
    return {
      hosts: loopback ? loopbackHosts : null,
      origins: loopback ? loopbackOrigins : null,
    };
  }
  // Explicit config: honor its Host set; honor its Origin set; and on a
  // loopback bind, if either was omitted, STILL gate it with the loopback
  // default (an empty allowlist would skip that gate entirely).
  const hosts =
    explicit.allowedHosts.length > 0
      ? new Set(explicit.allowedHosts)
      : loopback
        ? loopbackHosts
        : null;
  const origins =
    explicit.allowedOrigins.length > 0
      ? new Set(explicit.allowedOrigins)
      : loopback
        ? loopbackOrigins
        : null;
  return { hosts, origins };
}

export async function runHttp(composition: Composition): Promise<ServerType> {
  const auth: Auth = buildAuth(process.env);
  // Say where the signing keys come from, at BOOT. Appending one vendor's path
  // to KSOR_SSO_URL meant every other AS failed the fetch — classified
  // transient, so the door came up clean and 503'd each request naming
  // nothing. Discovery is memoized, so this is the same resolution the first
  // verification uses (issue #26).
  if (auth.mode === "public") {
    const keys = await auth.jwks();
    console.error(`auth: signing keys via ${keys.source} — ${keys.url}`);
    if (keys.advisory !== null) console.error(keys.advisory);
  }
  // RFC 9728 / MCP auth: WWW-Authenticate's `resource_metadata` must be the URL
  // of the metadata DOCUMENT (served at /.well-known/oauth-protected-resource/mcp
  // below), NOT the resource identifier — a client that follows the resource URL
  // hits GET /mcp → 405 and never finds the authorization server (review
  // 2026-08-19). Derived from the resource URL's origin so it matches the route.
  const resourceMetadataUrl =
    auth.mode === "public"
      ? new URL("/.well-known/oauth-protected-resource/mcp", auth.config.resourceUrl).toString()
      : "";
  const bind = resolveBind(process.env);
  const loopback = bind.host === "127.0.0.1" || bind.host === "localhost" || bind.host === "::1";
  // #3: the flag a dev needs to run loopback (KSOR_AUTH_DISABLED) must not,
  // on its own, permit an UNAUTHENTICATED PUBLIC bind — decision 7's "a
  // public bind fails closed unless explicitly flagged". A public bind with
  // auth off needs a SECOND deliberate acknowledgement (review, 2026-08-19).
  if (
    auth.mode === "disabled" &&
    !loopback &&
    process.env["KSOR_ALLOW_PUBLIC_UNAUTHENTICATED"] !== "1"
  ) {
    throw new AuthConfigError(
      `refusing an UNAUTHENTICATED PUBLIC bind (${bind.host}) — KSOR_AUTH_DISABLED is the ` +
        "loopback-dev flag, not a licence to serve the corpus to the internet with no auth. " +
        "Configure the SSO door (KSOR_SSO_URL + KSOR_MCP_RESOURCE_URL + KSOR_JWT_ALLOWED_AUDIENCES), " +
        "bind loopback, or set KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1 to accept the risk deliberately.",
    );
  }
  const security = resolveSecurity(bind);
  const { ctx, instance, pool, spaceSkipReason, version, verifyBoot } = composition;

  // Fail-soft env (envInt), never Number(env ?? default): a set-but-empty
  // var (routine with `gcloud --set-env-vars`) or a typo must fall back, not
  // silently become 0 — MAX_INFLIGHT 0 is a permanent 503, a 0 body cap a
  // permanent 413 (review, 2026-08-19).
  const maxBodyBytes = envInt(process.env, "KSOR_MAX_BODY_BYTES", 1_000_000, { minimum: 1024 });
  const maxInflight = envInt(process.env, "KSOR_MAX_INFLIGHT", 64, { minimum: 1 });
  let inflight = 0;

  // /ready is UNAUTHENTICATED and touches the DB — left uncapped it is a
  // pool-exhaustion amplifier: a flood checks out a connection per probe,
  // starving authenticated /mcp with PoolTimeout while the attacker spends no
  // credentials, and /mcp's inflight cap does not cover it (review,
  // 2026-08-19). Coalesce to at most ONE probe in flight with its verdict
  // cached ~1s: a load balancer still gets a fresh-enough answer, and a flood
  // shares the single in-flight probe instead of multiplying pool checkouts.
  const READY_TTL_MS = 1000;
  // `settledAt` is null while the probe is IN FLIGHT and a timestamp once it
  // finishes. Both halves matter, and the first was missing: keying the TTL on
  // the probe's START meant a probe SLOWER than the TTL stopped being shared —
  // so coalescing failed exactly when the database was unhealthy, which is the
  // only time it matters. Against a black-holed endpoint a connect attempt runs
  // to the pool's 10s timeout, so one probe per second accumulated ~10
  // concurrent checkouts, and /ready is unauthenticated and outside /mcp's
  // in-flight cap — the pool-exhaustion amplifier this was written to prevent,
  // rebuilt by an off-by-one-field (round-4 review of #43).
  let readyProbe: { settledAt: number | null; verdict: Promise<boolean> } | null = null;
  const readiness = (): Promise<boolean> => {
    if (readyProbe !== null) {
      // In flight: share it, however long it takes.
      if (readyProbe.settledAt === null) return readyProbe.verdict;
      // Settled recently: serve the cached verdict.
      if (Date.now() - readyProbe.settledAt < READY_TTL_MS) return readyProbe.verdict;
    }
    const entry: { settledAt: number | null; verdict: Promise<boolean> } = {
      settledAt: null,
      // An instance whose boot checks could not run is NOT ready —
      // that is what the word means, and reporting green let a platform route
      // traffic to an instance where every tool call fails on a missing column
      // (round-4 review of #43). The check retries here until the database
      // answers, so a cold start becomes a slow ready rather than a permanent
      // unverified state. A schema that is genuinely too old keeps failing,
      // which keeps the instance out of rotation instead of serving errors.
      //
      // The WHOLE chain shares one budget: the deferred schema check runs
      // first and is a bare query with no deadline of its own, so bounding
      // only the probe let /ready answer in 10.25s while claiming 8 (found
      // live, 2026-08-21).
      verdict: withProbeDeadline(
        (verifyBoot === null ? Promise.resolve() : verifyBoot()).then(() =>
          runProbe(pool, instance.tenantId, (client) =>
            client.query("SELECT 1 FROM corpora LIMIT 1"),
          ),
        ),
      ).then(
        () => true,
        () => false,
      ),
    };
    // Stamp on COMPLETION, so the TTL measures the age of an ANSWER.
    void entry.verdict.then(() => {
      entry.settledAt = Date.now();
    });
    readyProbe = entry;
    return entry.verdict;
  };

  const app = new Hono();

  // The exact hardening contract, not a framework default: HSTS
  // max-age=63072000; includeSubDomains and nosniff, nothing else (the
  // measured contract carried from the predecessor — review, 2026-08-19).
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
    c.res.headers.set("x-content-type-options", "nosniff");
  });

  // DNS-rebinding validation as middleware — Host AND Origin (the shape the
  // SDK points to; its transport-level option is deprecated).
  app.use("*", async (c, next) => {
    if (security.hosts !== null && !security.hosts.has(c.req.header("host") ?? "")) {
      return c.json({ error: "host not allowed" }, 421);
    }
    if (security.origins !== null) {
      const origin = c.req.header("origin");
      // A same-origin/non-browser request carries no Origin; a cross-origin
      // request carries one and must be on the allowlist.
      if (origin !== undefined && !security.origins.has(origin)) {
        return c.json({ error: "origin not allowed" }, 403);
      }
    }
    await next();
  });

  app.get("/live", (c) => c.json({ live: true }));

  app.get("/ready", async (c) =>
    (await readiness())
      ? c.json({ ready: true })
      : c.json({ ready: false, reason: "content store unreachable" }, 503),
  );

  // /health discloses corpus internals AND the calibrated floor VALUE — the
  // measured gate constant an attacker would tune probes against. On a PUBLIC
  // bind it therefore requires the bearer, same as /mcp; /live (below) stays
  // open for the load balancer (review 2026-08-19).
  app.get("/health", async (c) => {
    if (auth.mode === "public") {
      const token = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
      if (token === undefined) {
        return c.json({ error: "bearer token required" }, 401, {
          "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
        });
      }
      try {
        await auth.verify(token);
      } catch (error) {
        const transient = error instanceof TokenVerifyError && error.transient;
        return c.json(
          { error: transient ? "token verification temporarily unavailable" : "invalid token" },
          transient ? 503 : 401,
        );
      }
    }
    return c.json({
      corpus_id: instance.corpusId,
      abstain_gate:
        instance.abstain.vectorFloor === null
          ? "OFF (no floor declared — will not refuse out-of-corpus questions)"
          : instance.abstain.vectorFloor === "uncalibrated"
            ? "REFUSING (declared but uncalibrated — run calibrate and paste the floor)"
            : `floor ${instance.abstain.vectorFloor}`,
      embedding_space:
        spaceSkipReason === null
          ? `${instance.embeddingModel}/d${instance.embeddingDim} ok`
          : `${instance.embeddingModel}/d${instance.embeddingDim} unverified (check skipped: ${spaceSkipReason})`,
      auth: auth.mode,
    });
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
    auth.mode === "public"
      ? c.json({ resource: auth.config.resourceUrl, authorization_servers: [auth.config.ssoUrl] })
      : c.json({ error: "no public auth door configured" }, 404),
  );

  // The SDK v2 modern HTTP entry: serves the 2026-07-28 revision (per-request
  // envelope, handshake-free, `server/discover`) and — with `legacy:
  // "stateless"` — still answers 2025-era clients through the same stateless
  // idiom this gateway shipped before, so an older assistant keeps working
  // while new ones get the current protocol. The factory is per-request, which
  // is the shape we already had: one fresh server per exchange, nothing held
  // between them. `responseMode: "json"` keeps the response a single buffered
  // JSON body — we emit no mid-call notifications, and a stream would race the
  // per-request teardown (review, 2026-08-19).
  const mcpHandler = createMcpHandler(() => buildServer(ctx, version), {
    legacy: "stateless",
    responseMode: "json",
    onerror: (error) => console.error(`mcp handler: ${error.name}: ${error.message}`),
  });

  /**
   * BUFFER the whole response before the caller's in-flight slot is released.
   *
   * `responseMode: "json"` governs only MODERN exchanges; v2's legacy fallback
   * builds its transport with `sessionIdGenerator: undefined` alone, so 2025-era
   * exchanges answer over SSE and their `Response` resolves as soon as dispatch
   * STARTS — the search's embed call and pg queries then run outside the
   * concurrency cap. A caller picks that leg by simply omitting the `_meta`
   * envelope, which made KSOR_MAX_INFLIGHT bound nothing and let concurrent
   * searches exhaust the pool — the same starvation /ready's coalescing exists
   * to prevent (security re-verification, 2026-08-20). Draining here restores
   * the pre-upgrade semantics: the slot is held until the work is actually
   * done. Safe because every response this door serves terminates —
   * `subscriptions/listen`, the one long-lived stream v2 offers, is refused
   * below.
   */
  const handleMcp = async (
    request: Request,
    // The SDK's own type, not a structural copy: a hand-written duplicate
    // silently drifts if upstream adds a required field.
    authInfo?: AuthInfo,
  ): Promise<Response> => {
    // The boot checks gate EVERY REQUEST, not just /ready.
    //
    // Reporting not-ready keeps a platform from ROUTING traffic; it does not
    // stop anything that reaches the port. Proved live: with the store down at
    // boot and up moments later, /ready answered {"ready":false} and a direct
    // `read` still returned a `visibility: internal` document in full. A
    // governance guarantee cannot rest on a health probe an attacker, a
    // sidecar, or a stale load-balancer target is free to ignore — fail-closed
    // has to mean refusing the REQUEST (round-6 review of #43, and the live
    // walk of its own fix).
    //
    // Once verified this is a resolved promise, so the steady-state cost is a
    // single await.
    if (verifyBoot !== null) {
      try {
        await verifyBoot();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: `this record cannot be served: ${message.split("\n")[0]}`,
              data: { detail: message },
            },
            id: null,
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }
    }
    const response = await mcpHandler.fetch(request, authInfo === undefined ? {} : { authInfo });
    const body = await response.arrayBuffer();
    // A null-body status (204/205/304) throws if handed even a 0-byte buffer.
    // No such status is reachable through this door today, but the guard costs
    // a comparison and keeps an SDK addition from turning a valid response into
    // a bare 500 (fix verification, 2026-08-20).
    return new Response(body.byteLength === 0 ? null : body, {
      status: response.status,
      headers: response.headers,
    });
  };

  const mcp = bodyLimit({
    maxSize: maxBodyBytes,
    onError: (c) => c.json({ error: "request body too large" }, 413),
  });

  /**
   * Does this POST name `subscriptions/listen`, in either era's shape?
   *
   * Single requests only — a BATCH array cannot open a stream and so needs no
   * check here: a batch classifies legacy (whose leg has no listen handler, so
   * it answers `Method not found` and terminates), and a batch carrying the
   * modern envelope is refused outright by the SDK (`-32600`, batches are not
   * permitted from 2026-07-28 on). Verified, 2026-08-20.
   */
  const isListen = async (request: Request): Promise<boolean> => {
    // Modern requests declare the method in a header; legacy ones only in the
    // body. Check the header first so a malformed body cannot smuggle a listen.
    if (request.headers.get("mcp-method") === "subscriptions/listen") return true;
    try {
      const body: unknown = await request.json();
      return (
        typeof body === "object" &&
        body !== null &&
        (body as { method?: unknown }).method === "subscriptions/listen"
      );
    } catch {
      // Unparseable body: not a listen — let the SDK produce the parse error.
      return false;
    }
  };

  app.post("/mcp", mcp, async (c) => {
    // AUTHENTICATE BEFORE TAKING A SLOT. The in-flight cap exists to bound
    // SERVING work; letting an unverified caller hold a slot through a
    // JWKS-backed RS256 verify hands anonymous traffic the whole budget. The
    // negative cache is keyed on the token hash, so a flood of DISTINCT forged
    // tokens misses it every time, and during a JWKS outage each verify blocks
    // for the fetch timeout while holding its slot — authenticated callers
    // then get 503 "server busy" from traffic that never proved anything
    // (review, 2026-08-20). Verification is bounded by its own timeouts and
    // costs no pool connection, so it is safe outside the cap.
    let identity: VerifiedIdentity | null = null;
    let bearer = "";
    if (auth.mode === "public") {
      const token = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
      if (token === undefined) {
        return c.json({ error: "bearer token required" }, 401, {
          "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
        });
      }
      try {
        identity = await auth.verify(token);
      } catch (error) {
        const transient = error instanceof TokenVerifyError && error.transient;
        return c.json(
          { error: transient ? "token verification temporarily unavailable" : "invalid token" },
          transient ? 503 : 401,
        );
      }
      bearer = token;
    }

    if (inflight >= maxInflight) {
      return c.json({ error: "server busy — retry shortly" }, 503, { "retry-after": "1" });
    }
    inflight += 1;
    try {
      // `subscriptions/listen` holds an SSE stream open for the client's
      // lifetime, and the concurrency cap cannot bound it (its Response
      // resolves immediately) — the SDK's own 1024-stream default would be the
      // only limit. This server declares `tools.listChanged` and never
      // publishes a change event, so a listen stream is pure cost to both
      // sides. Refuse it honestly rather than hold sockets for nothing
      // (security re-verification, 2026-08-20).
      if (await isListen(c.req.raw.clone())) {
        return c.json(
          {
            error:
              "subscriptions/listen is not served — this record publishes no change " +
              "notifications; poll search/outline/read instead",
          },
          501,
        );
      }
      if (identity !== null) {
        // Hand the SDK the identity WE verified. ksor authorizes through the
        // kit's AsyncLocalStorage actor, not this field, so nothing reads it
        // today — but the SDK never populates `authInfo` itself, so leaving it
        // undefined is a fail-open trap for any future tool that consults it
        // (in v2 it surfaces as `extra.http.authInfo`). `scopes: []` fails
        // CLOSED for any future scope check. `extra` carries the SUBJECT:
        // `clientId` names the calling application, not the person, so a tool
        // reading only the AuthInfo fields would otherwise get an identity
        // different from the one the audit rows record (security
        // re-verification + fix verification, 2026-08-20).
        const verified = identity;
        return await runWithIdentity(verified, () =>
          handleMcp(c.req.raw, {
            token: bearer,
            clientId: verified.clientId,
            scopes: [],
            ...(verified.expiresAt === null ? {} : { expiresAt: verified.expiresAt }),
            extra: { sub: verified.sub, tenantId: verified.tenantId },
          }),
        );
      }
      return await handleMcp(c.req.raw);
    } finally {
      inflight -= 1;
    }
  });

  // Stateless: no session to resume and no server-initiated push (this record
  // publishes no change notifications), so GET/DELETE on /mcp are not offered.
  app.on(["GET", "DELETE"], "/mcp", (c) =>
    c.json({ error: "method not allowed — POST JSON-RPC to /mcp (stateless transport)" }, 405),
  );

  // AWAIT the bind: EADDRINUSE / EACCES / an unroutable host must reach the
  // CLI exit contract in main(), not escape as an uncaught 'error' event and
  // a stack trace (review, 2026-08-19). The boot line prints AFTER binding.
  const server = await new Promise<ServerType>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, hostname: bind.host, port: bind.port }, () => {
      // Bind succeeded: detach the bind-time rejecter (a settled promise
      // swallows it) and attach a PERSISTENT handler, so a post-bind server
      // error (EMFILE, a socket fault) is logged instead of vanishing
      // (review 2026-08-19).
      s.off("error", reject);
      s.on("error", (err: Error) => console.error(`gateway server error: ${err.message}`));
      resolve(s);
    });
    s.once("error", reject);
  });
  console.error(
    `ksor gateway serving ${instance.corpusId} on http://${bind.host}:${bind.port}/mcp ` +
      `(auth: ${auth.mode}, abstain gate: ${
        instance.abstain.vectorFloor === null
          ? "OFF (no floor)"
          : instance.abstain.vectorFloor === "uncalibrated"
            ? "REFUSING (uncalibrated)"
            : `floor ${instance.abstain.vectorFloor}`
      })`,
  );

  // Drain: close the listener FIRST, then the pool in its callback — the pool
  // must not be torn down under in-flight work (review, 2026-08-19).
  let draining = false;
  const drainDeadlineMs = drainTimeoutMs();
  const shutdown = (): void => {
    // A second signal must not re-enter: `process.once` covers one signal each,
    // but SIGTERM followed by SIGINT called this twice and ended the pool twice.
    if (draining) return;
    draining = true;
    // SAY SO. Attaching a SIGTERM/SIGINT listener suppresses Node's default
    // terminate, so from here on this process exits only because we let it —
    // and it used to do that silently, which is how a stopped-looking server
    // could still be holding its port with the operator's prompt already back
    // (review 2026-08-20, an orphan found running long after).
    console.error("ksor gateway: draining…");
    // A hard deadline. Both closes below are unawaited network teardowns with
    // no bound of their own; against a remote pooler either can hang, and an
    // idle pooled socket keeps the event loop alive, so a hang here is an
    // unkillable server rather than a slow one. Unref'd so it never DELAYS a
    // clean exit — it only catches one that never arrives.
    const deadline = setTimeout(() => {
      // Non-zero: the drain did NOT finish, and a supervisor reading exit 0
      // would record a clean stop for one that dropped work.
      console.error(`ksor gateway: drain exceeded ${drainDeadlineMs}ms — exiting anyway`);
      process.exit(75);
    }, drainDeadlineMs);
    deadline.unref();

    server.close(() => {
      // Close the MCP handler INSIDE the listener's callback, beside the pool:
      // once closed it throws "This MCP handler has been closed" for any new
      // fetch, which would escape as a bare 500 for requests still in the drain
      // window. The listener stops accepting first, in-flight exchanges finish,
      // then both are torn down (security re-verification, 2026-08-20).
      void Promise.allSettled([mcpHandler.close(), pool.end()]).then(() => {
        clearTimeout(deadline);
        console.error("ksor gateway: stopped");
      });
    });
    // close() waits for EXISTING connections to end; an idle keep-alive MCP
    // client (between requests) would keep its callback from ever firing — and
    // thus pool.end() from running — until SIGKILL. Close idle sockets so the
    // drain actually completes (review 2026-08-19).
    (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  return server;
}
