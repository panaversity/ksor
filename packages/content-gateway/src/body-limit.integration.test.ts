/**
 * A 413 must not poison the connection it was sent on.
 *
 * Hono's `bodyLimit` answers as soon as the declared length is over the cap and
 * never reads the rest of the request. That is right — reading a body you have
 * already refused is work an attacker chooses the size of — but the response
 * still advertised `Connection: keep-alive`, so a client with a keep-alive agent
 * put its NEXT request on a socket the server was about to drop. Measured on the
 * mainstream MCP client stack (Node `fetch`/undici): the request after a 413
 * failed at the transport level 12 times in 25, with no HTTP status at all
 * (protocol QA, 2026-08-25).
 *
 * curl passes against the bug, because it dials a fresh connection each time. So
 * this drives a real `http.Agent({ keepAlive: true, maxSockets: 1 })` and sends
 * a NORMAL request after the refusal — the only shape that can see it.
 */

import { Agent, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compose } from "./compose.js";
import { runHttp } from "./http.js";
import type { ServerType } from "@hono/node-server";

const PORT = 8861;
const CAP = 1024;
/**
 * BIG, not merely over the cap. A body of a few KB is written into the socket
 * buffer in one go, so the server reads it all off the wire even after
 * refusing and there is no undelivered remainder to poison anything. The
 * reported failure used ~1MB; several MB makes it deterministic.
 */
const OVERSIZED = "z".repeat(8 * 1024 * 1024);

const INSTANCE = `---
format: 2
name: body-limit-fixture
title: Body Limit Fixture
description: Drives the door's request-size refusal over a kept-alive socket.
database:
  dsn_env: KSOR_BODY_LIMIT_DSN
embedding:
  provider: fake
---

Answer only from this fixture.
`;

interface Attempt {
  readonly status: number | null;
  readonly reused: boolean;
  readonly error: string | null;
}

/** One request on the SHARED agent, reporting transport failures rather than throwing. */
function send(agent: Agent, body: string): Promise<Attempt> {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        agent,
        host: "127.0.0.1",
        port: PORT,
        path: "/mcp",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? null,
            reused: req.reusedSocket === true,
            error: null,
          }),
        );
      },
    );
    req.on("error", (error: Error) =>
      resolve({ status: null, reused: req.reusedSocket === true, error: error.message }),
    );
    req.end(body);
  });
}

/** The 413's response headers, straight off a socket we control. */
function rawRefusal(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    const done = (): void => resolve(buf.split("\r\n\r\n")[0] ?? "");
    const sock = connect(PORT, "127.0.0.1", () => {
      // Declare an oversized body and send almost NONE of it. The door refuses
      // on the DECLARED Content-Length, before reading the body — which is the
      // whole reason it closes rather than draining. Actually writing the two
      // megabytes raced the refusal: the server closed mid-write, the client's
      // socket errored, and the 413 that had already been sent went with it, so
      // the assertion saw an empty header block. Flaky 4 runs in 5, always in
      // the direction that fails a correct server.
      sock.write(
        `POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nContent-Type: application/json\r\n` +
          `Content-Length: ${OVERSIZED.length + 64}\r\n\r\n{"p":"start`,
      );
    });
    sock.on("data", (d) => {
      buf += d;
      if (buf.includes("\r\n\r\n")) done();
    });
    sock.on("close", () => {
      if (buf !== "") done();
    });
    sock.on("error", () => {
      if (buf !== "") done();
    });
    setTimeout(done, 5_000);
  });
}

describe("an oversized request is refused without killing the connection", () => {
  let server: ServerType;
  let pool: { end: () => Promise<void> };
  const saved = { ...process.env };

  beforeAll(async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ksor-body-limit-"));
    const instancePath = path.join(dir, "instance.md");
    writeFileSync(instancePath, INSTANCE);
    // Nothing here reaches the database: the cap is enforced in middleware,
    // before any handler runs. The boot simply defers, which is a state the
    // door is built to serve from.
    process.env["KSOR_BODY_LIMIT_DSN"] = "postgres://ksor:ksor@127.0.0.1:1/ksor";
    process.env["KSOR_AUTH"] = "disabled-local";
    process.env["KSOR_MCP_PORT"] = String(PORT);
    process.env["KSOR_MAX_BODY_BYTES"] = String(CAP);
    process.env["KSOR_READ_RETRY_ATTEMPTS"] = "1";
    process.env["KSOR_READ_RETRY_BACKOFF_S"] = "0";
    const composition = await compose(instancePath, "0.0.0-test");
    pool = composition.pool;
    server = await runHttp(composition);
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await pool?.end().catch(() => undefined);
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  it("leaves the caller's NEXT request working on the same keep-alive agent", async () => {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const small = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      const first = await send(agent, small);
      expect(first.error, "the door answers a normal request").toBeNull();

      const oversized = JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "x",
        params: { p: "z".repeat(CAP * 4) },
      });
      const refused = await send(agent, oversized);
      expect(refused.status, "the cap is enforced").toBe(413);

      // THE ASSERTION. Before the fix this came back with no status and
      // `write EPIPE` / `read ECONNRESET`, because the 413 advertised
      // keep-alive on a socket the server had already given up on.
      const next = await send(agent, small);
      expect(
        next.error,
        `the request AFTER a 413 died on the poisoned socket: ${next.error}`,
      ).toBeNull();
      expect(next.status).not.toBeNull();
    } finally {
      agent.destroy();
    }
  }, 60_000);

  it("tells the client not to reuse the socket, rather than pretending it may", async () => {
    // Read off the WIRE, because this is the assertion that discriminates. The
    // shipped door answered `Connection: keep-alive` + `Keep-Alive: timeout=5`
    // and then reset the socket; a client library that hides the reset (by
    // retrying on a fresh connection) makes the defect invisible from above,
    // which is why the keep-alive agent above is necessary but not sufficient.
    //
    // RFC 9112 §9.6: a server that responds before reading the whole body has
    // to close the connection and say so. Draining instead would mean reading a
    // body already refused, at a size the CALLER chooses.
    const headers = await rawRefusal();
    expect(headers, `413 headers:\n${headers}`).toMatch(/^connection: close$/im);
    expect(headers, "and no contradicting keep-alive").not.toMatch(/keep-alive/i);
  }, 60_000);
});
