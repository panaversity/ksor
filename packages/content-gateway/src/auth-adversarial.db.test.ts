/**
 * The bearer door, driven with REAL tokens against the REAL server.
 *
 * `auth.test.ts` exercises the verify seam with an injected verifier, and it is
 * good — but nothing anywhere booted the gateway in bearer mode, so the 401
 * path, the `WWW-Authenticate` challenge, the Host 421 and the Origin 403 had
 * zero end-to-end coverage. That is the difference between a private record and
 * a public one, and it was resting on inspection (issue #33, "auth negatives,
 * exhaustively").
 *
 * It matters more now: `jwks_uri` is discovered from the AS's own metadata
 * rather than guessed (issue #26), so the key-fetch path itself is new code.
 * This proves the discovery works against a real metadata document AND that
 * every way of presenting a bad token is refused.
 *
 * The AS here is real, not mocked: an RS256 keypair, an RFC 8414 metadata
 * document, and a JWKS endpoint, all served over loopback. The gateway
 * discovers the keys the same way it would from Auth0.
 *
 * The issue calls the wrong-`aud` case the one that matters most — RFC 8707
 * audience binding is the whole point of the resource-server posture — so it
 * gets a positive control beside it: the same token, same key, differing only
 * in `aud`, one accepted and one refused.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyObject } from "jose";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.mjs");
/** The write verbs live on the ksor binary; CLI above is the gateway's serve entry. */
const KSOR_CLI = path.resolve(CLI, "..", "..", "..", "ksor", "dist", "cli.mjs");
const DB = "ksor_auth_adversarial";
const TENANT = "auth-corp";

interface TestAs {
  readonly issuer: string;
  readonly close: () => Promise<void>;
  /** Mint a token; every field overridable so a case can break exactly one. */
  readonly token: (over?: {
    aud?: string | string[];
    sub?: string | null;
    exp?: number;
    nbf?: number;
    iss?: string;
    kid?: string;
    key?: KeyObject;
    alg?: string;
  }) => Promise<string>;
  /** A SECOND keypair, never advertised — for signature-forgery cases. */
  readonly foreignKey: KeyObject;
}

/** An authorization server: RFC 8414 metadata + a JWKS, over loopback. */
async function startAs(port: number): Promise<TestAs> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const foreign = await generateKeyPair("RS256", { extractable: true });
  const jwk = (await exportJWK(publicKey)) as JWK;
  jwk.kid = "test-key-1";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const issuer = `http://127.0.0.1:${port}`;
  const server: Server = createServer((req, res) => {
    if (req.url === "/.well-known/oauth-authorization-server") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks` }));
      return;
    }
    if (req.url === "/jwks") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));

  const now = (): number => Math.floor(Date.now() / 1000);
  return {
    issuer,
    foreignKey: foreign.privateKey,
    close: () => new Promise<void>((r) => server.close(() => r())),
    token: async (over = {}) => {
      const claims: Record<string, unknown> = {};
      if (over.sub !== null) claims["sub"] = over.sub ?? "user-1";
      const jwt = new SignJWT(claims)
        .setProtectedHeader({ alg: over.alg ?? "RS256", kid: over.kid ?? "test-key-1" })
        .setIssuedAt(now())
        .setIssuer(over.iss ?? issuer)
        .setAudience(over.aud ?? "http://127.0.0.1:9/mcp")
        .setExpirationTime(over.exp ?? now() + 600);
      if (over.nbf !== undefined) jwt.setNotBefore(over.nbf);
      return jwt.sign(over.key ?? privateKey);
    },
  };
}

describe.runIf(adminDsn !== "")("the bearer door, adversarially (db)", () => {
  let admin: pg.Pool;
  let as: TestAs;
  let gateway: ChildProcess;
  let work: string;
  let mcpUrl: string;
  let resource: string;
  const asPort = 31000 + Math.floor(Math.random() * 2000);
  const port = 33000 + Math.floor(Math.random() * 2000);

  const call = async (
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<{ status: number; text: string; headers: Headers }> => {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/call",
        "Mcp-Name": "outline",
        ...headers,
      },
      body: JSON.stringify(
        body ?? {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "outline",
            arguments: {},
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        },
      ),
    });
    return { status: res.status, text: await res.text(), headers: res.headers };
  };

  const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;

    as = await startAs(asPort);
    mcpUrl = `http://127.0.0.1:${port}/mcp`;
    resource = `http://127.0.0.1:${port}/mcp`;

    work = mkdtempSync(path.join(tmpdir(), "ksor-auth-"));
    const instancePath = path.join(work, "instance.md");
    writeFileSync(
      instancePath,
      `---\nformat: 1\nname: ${TENANT}\ndatabase:\n  dsn_env: KSOR_TEST_DSN\nembedding:\n  provider: fake\n---\n\n# Auth record\n\nA record used to prove the bearer door refuses.\n`,
      "utf8",
    );

    // Provision + publish, so a VALID token has something to be served.
    const run = (args: string[]): Promise<void> =>
      new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [KSOR_CLI, ...args], {
          env: { ...process.env, KSOR_TEST_DSN: url.toString(), KSOR_DB_URL: url.toString() },
        });
        c.on("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`${args[0]} → ${code}`)),
        );
      });
    const knowledge = path.join(work, "knowledge");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(knowledge, { recursive: true });
    writeFileSync(
      path.join(knowledge, "policy.md"),
      "---\ntitle: Policy\nstatus: approved\nowner: o@example.test\nprovenance:\n  - handbook\n---\n\n# Policy\n\nA governed document long enough to be prose rather than navigation, so the\nrecord has something real to serve to a caller whose token actually verifies.\n",
      "utf8",
    );
    await run(["schema", "--instance", instancePath, "--apply"]);
    await run(["grant", "--instance", instancePath]);
    await run(["ingest", "--instance", instancePath, "--knowledge", knowledge, "--flip"]);

    // The door in PUBLIC (bearer) mode, keys discovered from the AS metadata.
    gateway = spawn(process.execPath, [CLI], {
      env: {
        ...process.env,
        KSOR_INSTANCE: instancePath,
        KSOR_TEST_DSN: url.toString(),
        KSOR_MCP_PORT: String(port),
        KSOR_SSO_URL: as.issuer,
        KSOR_MCP_RESOURCE_URL: resource,
        KSOR_JWT_ALLOWED_AUDIENCES: resource,
        KSOR_AUTH: "",
      },
    });
    let booted = "";
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`no boot line: ${booted}`)), 40_000);
      gateway.stderr?.on("data", (d: Buffer) => {
        booted += d.toString();
        if (booted.includes("serving")) {
          clearTimeout(deadline);
          resolve();
        }
      });
      gateway.on("exit", (c) => reject(new Error(`gateway exited ${c}: ${booted}`)));
    });
    // The discovery this suite exists partly to prove — asserted on the RESOLVED
    // line, not on the string "oauth-authorization-server", which also appears
    // in the fallback ADVISORY. The looser form passed while the door was in
    // fact using the vendor guess and 503ing every request.
    expect(booted, `boot log:\n${booted}`).toContain(
      `keys     oauth-authorization-server — ${as.issuer}/jwks`,
    );
    expect(booted, "a guess must not have been used").not.toContain("GUESS");
  }, 180_000);

  afterAll(async () => {
    gateway?.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    gateway?.kill("SIGKILL");
    await as?.close();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end();
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  }, 60_000);

  it("POSITIVE CONTROL — a correct token is served", async () => {
    // Without this every refusal below could be a broken door rather than a
    // working one, and the whole suite would pass on a server that refuses
    // everything.
    const r = await call(bearer(await as.token({ aud: resource })));
    expect(r.status, r.text.slice(0, 300)).toBe(200);
    expect(r.text, "and it actually answers from the record").toContain("policy");
  }, 60_000);

  it("no token at all → 401 with a resource_metadata challenge", async () => {
    const r = await call({});
    expect(r.status).toBe(401);
    const challenge = r.headers.get("www-authenticate") ?? "";
    expect(challenge, "RFC 9728: the challenge points at the metadata DOCUMENT").toContain(
      "resource_metadata=",
    );
    expect(challenge).toContain("/.well-known/oauth-protected-resource/mcp");
  }, 60_000);

  it.each([
    ["a token for a DIFFERENT resource", { aud: "https://other.example.com/mcp" }],
    ["no audience this door accepts", { aud: "urn:something-else" }],
  ])(
    "%s → 401",
    async (_label, over) => {
      // The case the issue calls the most important: RFC 8707 audience binding is
      // the whole point of the resource-server posture. Same key, same issuer,
      // same everything — only `aud` differs from the control above.
      const r = await call(bearer(await as.token(over)));
      expect(r.status, r.text.slice(0, 200)).toBe(401);
    },
    60_000,
  );

  it("an EXPIRED token → 401", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const r = await call(bearer(await as.token({ aud: resource, exp: past })));
    expect(r.status).toBe(401);
  }, 60_000);

  it("a NOT-YET-VALID token → 401", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const r = await call(bearer(await as.token({ aud: resource, nbf: future })));
    expect(r.status).toBe(401);
  }, 60_000);

  it("a token signed by a key the AS never published → 401", async () => {
    // Forgery: correct shape, correct kid, wrong private key.
    const r = await call(bearer(await as.token({ aud: resource, key: as.foreignKey })));
    expect(r.status).toBe(401);
  }, 60_000);

  it("an UNKNOWN kid → 503, deliberately, NOT 401", async () => {
    // This looks like the wrong answer and is the right one. An unmatched kid
    // is `JWKSNoMatchingKey`, which `isBadToken` classifies as TRANSIENT
    // (auth.ts:291) — because the honest cause is rotation lag: the AS rotated,
    // our cached JWKS is stale, and jose refetches. During that window a VALID
    // token is signed by a key we have not loaded yet.
    //
    // 401 tells a client to re-authenticate, which does not help and can log a
    // user out over a key rotation. 503 tells it to retry, which does help. A
    // forged kid getting 503 rather than 401 is a weaker signal to an attacker,
    // not a way in — the token is still refused, and jose's cooldown bounds the
    // refetch it triggers.
    //
    // Asserted so the classification is a decision the next reader can see,
    // rather than a surprise (#33).
    const r = await call(bearer(await as.token({ aud: resource, kid: "not-a-real-kid" })));
    expect(r.status, r.text.slice(0, 200)).toBe(503);
    expect(r.text, "and it never becomes an answer").not.toContain("policy");
  }, 60_000);

  it("a token with NO SUBJECT → 401", async () => {
    // `sub` is a required claim: a §7 ledger row that cannot name the caller
    // proves nothing.
    const r = await call(bearer(await as.token({ aud: resource, sub: null })));
    expect(r.status).toBe(401);
  }, 60_000);

  it("alg: none → 401", async () => {
    // The classic. Hand-built, because `jose` will not sign one.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        sub: "user-1",
        aud: resource,
        iss: as.issuer,
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toString("base64url");
    const r = await call(bearer(`${header}.${body}.`));
    expect(r.status).toBe(401);
  }, 60_000);

  it("HS256 algorithm confusion → 401", async () => {
    // Signing with a symmetric algorithm over the public key material is the
    // other half of the classic pair; the verifier pins RS256.
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: "user-1", aud: resource, exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString("base64url");
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", "secret").update(`${header}.${body}`).digest("base64url");
    const r = await call(bearer(`${header}.${body}.${sig}`));
    expect(r.status).toBe(401);
  }, 60_000);

  it.each([
    ["garbage", "not-a-token"],
    ["two segments", "aaa.bbb"],
    ["empty", ""],
    ["only whitespace", "   "],
  ])(
    "a malformed bearer (%s) → 401, never a 500",
    async (_label, token) => {
      const r = await call({ authorization: `Bearer ${token}` });
      expect(r.status, `${r.status}: ${r.text.slice(0, 160)}`).toBe(401);
    },
    60_000,
  );

  it("a non-Bearer scheme → 401", async () => {
    const r = await call({ authorization: "Basic dXNlcjpwYXNz" });
    expect(r.status).toBe(401);
  }, 60_000);

  it("a spoofed Host header → 421, before any token is even considered", async () => {
    // Sent over a RAW socket: `fetch` treats Host as a forbidden header and
    // drops it silently, so a fetch-based version of this test passes against a
    // door with NO Host gate at all. Found writing this suite — a probe has to
    // be able to send the thing it is probing for.
    const { request } = await import("node:http");
    const token = await as.token({ aud: resource });
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: "/mcp",
          method: "POST",
          headers: {
            host: "evil.example.com",
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.end("{}");
    });
    expect(status, "DNS-rebind defence: the door answers only on names it knows").toBe(421);
  }, 60_000);

  it("a cross-origin browser request → 403", async () => {
    const r = await call({
      ...bearer(await as.token({ aud: resource })),
      origin: "https://evil.example.com",
    });
    expect(r.status).toBe(403);
  }, 60_000);

  it("EVERY 401 carries the challenge, not only the one for a missing token", async () => {
    // The suite asserted the STATUS of each rejection and never the header, so
    // it stayed green while the invalid-token branch returned a bare 401 — and
    // that branch serves the most common 401 a real client ever sees, a token
    // that expired mid-conversation. Left bare, such a client has no pointer
    // back to the resource-metadata document and cannot re-discover the
    // authorization server it was just talking to. The MCP authorization spec
    // requires WWW-Authenticate on a 401 without qualification.
    const rejected: [string, Awaited<ReturnType<typeof call>>][] = [
      ["no token", await call({})],
      [
        "expired",
        await call(
          bearer(await as.token({ aud: resource, exp: Math.floor(Date.now() / 1000) - 60 })),
        ),
      ],
      [
        "wrong audience",
        await call(bearer(await as.token({ aud: "https://other.example.com/mcp" }))),
      ],
      ["no subject", await call(bearer(await as.token({ aud: resource, sub: "" })))],
    ];
    for (const [what, r] of rejected) {
      expect(r.status, `${what} must be a 401`).toBe(401);
      const challenge = r.headers.get("www-authenticate") ?? "";
      expect(challenge, `${what}: 401 with no challenge — the client cannot re-discover`).toContain(
        "resource_metadata=",
      );
      expect(challenge, `${what}`).toContain("/.well-known/oauth-protected-resource/mcp");
    }
  }, 120_000);

  it("a 503 is NOT challenged — an outage must not send a good token back to login", async () => {
    // An unreachable JWKS is not an authorization failure. Challenging here
    // would tell a client whose token is perfectly valid to re-authenticate
    // because OUR key fetch failed.
    const r = await call(bearer(await as.token({ aud: resource, kid: "rotated-away" })));
    expect(r.status).toBe(503);
    expect(r.headers.get("www-authenticate")).toBeNull();
  }, 60_000);

  it("and the door is still serving afterwards — none of that killed it", async () => {
    const r = await call(bearer(await as.token({ aud: resource })));
    expect(r.status, "a refusal path must not take the process down").toBe(200);
  }, 60_000);
});

describe.runIf(adminDsn === "")("the bearer door (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
