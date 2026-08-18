// The edge-hardening contract from harden.py, exercised with fake req/res —
// pure: no sockets, no listener.

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { harden, type HttpHandler } from "./harden.js";

const HSTS = "max-age=63072000; includeSubDomains";

class FakeRes {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = "";
  ended = false;
  headersSent = false;
  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }
  writeHead(status: number, headers?: Record<string, string>): this {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers ?? {})) {
      this.headers[name.toLowerCase()] = value;
    }
    this.headersSent = true;
    return this;
  }
  end(chunk?: string | Buffer): void {
    if (chunk !== undefined) this.body += chunk.toString();
    this.ended = true;
    this.headersSent = true;
  }
}

function fakeRes(): { raw: FakeRes; res: ServerResponse } {
  const raw = new FakeRes();
  return { raw, res: raw as unknown as ServerResponse };
}

function fakeReq(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  chunks?: (string | Buffer)[];
}): IncomingMessage {
  const req = Readable.from(options.chunks ?? []);
  return Object.assign(req, {
    method: options.method ?? "POST",
    url: options.url ?? "/mcp",
    headers: options.headers ?? {},
  }) as unknown as IncomingMessage;
}

function appSpy(): { app: HttpHandler; calls: { body: Buffer | undefined }[] } {
  const calls: { body: Buffer | undefined }[] = [];
  const app: HttpHandler = (_req, res, body) => {
    calls.push({ body });
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  };
  return { app, calls };
}

describe("security headers", () => {
  it("are appended to the app's response, with the exact harden.py values", async () => {
    const { app } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app)(fakeReq({ method: "GET", url: "/mcp" }), res);
    expect(raw.headers["strict-transport-security"]).toBe(HSTS);
    expect(raw.headers["x-content-type-options"]).toBe("nosniff");
    expect(raw.statusCode).toBe(200);
  });

  it("are present on harden's own 308 and 413 responses too", async () => {
    const { app } = appSpy();
    const redirect = fakeRes();
    await harden(app)(
      fakeReq({ method: "GET", url: "/.well-known/oauth-protected-resource" }),
      redirect.res,
    );
    expect(redirect.raw.headers["strict-transport-security"]).toBe(HSTS);

    const refused = fakeRes();
    await harden(app)(fakeReq({ headers: { "content-length": "2000000" } }), refused.res);
    expect(refused.raw.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("bare RFC 9728 protected-resource-metadata redirect", () => {
  it("308s the bare path to the /mcp-suffixed one, without invoking the app", async () => {
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app)(
      fakeReq({ method: "GET", url: "/.well-known/oauth-protected-resource" }),
      res,
    );
    expect(raw.statusCode).toBe(308);
    expect(raw.headers["location"]).toBe("/.well-known/oauth-protected-resource/mcp");
    expect(raw.body).toBe("");
    expect(calls).toHaveLength(0);
  });

  it("honors a custom resourcePath", async () => {
    const { app } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app, { resourcePath: "/api/mcp" })(
      fakeReq({ method: "GET", url: "/.well-known/oauth-protected-resource?x=1" }),
      res,
    );
    expect(raw.statusCode).toBe(308);
    expect(raw.headers["location"]).toBe("/.well-known/oauth-protected-resource/api/mcp");
  });

  it("passes the already-suffixed path through to the app", async () => {
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app)(
      fakeReq({ method: "GET", url: "/.well-known/oauth-protected-resource/mcp" }),
      res,
    );
    expect(raw.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe("request-body cap — declared Content-Length", () => {
  it("refuses an oversized declared body with a clean 413 before reading it", async () => {
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app)(fakeReq({ headers: { "content-length": "1000001" } }), res);
    expect(raw.statusCode, `response: ${JSON.stringify(raw)}`).toBe(413);
    expect(raw.headers["content-type"]).toBe("text/plain");
    expect(raw.body).toBe("request body too large");
    expect(calls).toHaveLength(0);
  });

  it("a declared length exactly at the cap passes through, unbuffered", async () => {
    const { app, calls } = appSpy();
    const { res } = fakeRes();
    await harden(app)(fakeReq({ headers: { "content-length": "1000000" } }), res);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body, "declared-length bodies are the app's to read").toBeUndefined();
  });

  it("an unparseable Content-Length is not treated as too big", async () => {
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app)(fakeReq({ headers: { "content-length": "9999999999abc" } }), res);
    expect(raw.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe("request-body cap — chunked (no declared length)", () => {
  it("buffers under-cap bodies and replays them to the app byte-exact", async () => {
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    const chunks = ['{"jsonrpc":', Buffer.from('"2.0"}')];
    await harden(app)(fakeReq({ chunks }), res);
    expect(raw.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body?.toString()).toBe('{"jsonrpc":"2.0"}');
  });

  it("refuses past the cap mid-buffer with the same clean 413; the app never runs", async () => {
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    const big = Buffer.alloc(600, "x");
    await harden(app, { maxBodyBytes: 1024 })(
      fakeReq({ chunks: [big, big] }), // 1200 > 1024
      res,
    );
    expect(raw.statusCode, `response: ${JSON.stringify(raw)}`).toBe(413);
    expect(raw.body).toBe("request body too large");
    expect(calls).toHaveLength(0);
  });

  it("GET/HEAD/OPTIONS without a declared length are never buffered", async () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const { app, calls } = appSpy();
      const { raw, res } = fakeRes();
      await harden(app)(fakeReq({ method }), res);
      expect(raw.statusCode, method).toBe(200);
      expect(calls[0]?.body, method).toBeUndefined();
    }
  });

  it("a client disconnect mid-buffer gets no response and never reaches the app", async () => {
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    const req = new Readable({ read() {} });
    Object.assign(req, { method: "POST", url: "/mcp", headers: {} });
    req.push(Buffer.from("partial"));
    setImmediate(() => req.destroy(new Error("client gone")));
    await harden(app)(req as unknown as IncomingMessage, res);
    expect(raw.ended, `response: ${JSON.stringify(raw)}`).toBe(false);
    expect(raw.statusCode).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("cap configuration", () => {
  it("reads KSOR_MAX_BODY_BYTES from the provided env", async () => {
    const { app } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app, { env: { KSOR_MAX_BODY_BYTES: "2048" } })(
      fakeReq({ chunks: [Buffer.alloc(2049)] }),
      res,
    );
    expect(raw.statusCode).toBe(413);
  });

  it("clamps an env value below 1024 to the floor, with a warning", async () => {
    const warn = vi.fn();
    const { app, calls } = appSpy();
    const { raw, res } = fakeRes();
    const hardened = harden(app, { env: { KSOR_MAX_BODY_BYTES: "10" }, warn });
    await hardened(fakeReq({ chunks: [Buffer.alloc(500)] }), res); // under the clamped 1024 floor
    expect(raw.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("KSOR_MAX_BODY_BYTES"));

    const over = fakeRes();
    await hardened(fakeReq({ chunks: [Buffer.alloc(1025)] }), over.res);
    expect(over.raw.statusCode).toBe(413);
  });

  it("an explicit maxBodyBytes option wins over env", async () => {
    const { app } = appSpy();
    const { raw, res } = fakeRes();
    await harden(app, { maxBodyBytes: 2048, env: { KSOR_MAX_BODY_BYTES: "1000000" } })(
      fakeReq({ headers: { "content-length": "4096" } }),
      res,
    );
    expect(raw.statusCode).toBe(413);
  });
});
