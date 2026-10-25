import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const AUTH = fileURLToPath(new URL("../templates/scaffold/system/site/lib/auth/", import.meta.url));
const HARNESS = `
const mode = process.argv[2];
process.env.NEXT_PUBLIC_KSOR_SSO_URL = "https://issuer.example";
process.env.NEXT_PUBLIC_KSOR_OAUTH_CLIENT_ID = "record";
process.env.NEXT_PUBLIC_KSOR_OAUTH_REDIRECT_URI = "https://record.example/auth/callback";
const values = new Map();
values.set("ksor.oauth.pending", mode === "malformed-state" ? "{" :
  mode === "invalid-state" ? "null" : JSON.stringify({state:"expected",verifier:"verifier",returnTo:"/docs"}));
globalThis.sessionStorage = {
  getItem(key) { if (mode === "blocked-read") throw new Error("storage blocked"); return values.get(key) ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { if (mode === "blocked-write") throw new Error("storage blocked"); values.set(key, value); },
};
let exchanges = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes(".well-known")) return {ok:true,json:async()=>({authorization_endpoint:"https://issuer.example/authorize",token_endpoint:"https://issuer.example/token"})};
  exchanges++;
  if (mode === "network") throw new TypeError("Failed to fetch");
  if (mode === "bad-json") return {ok:true,json:async()=>{throw new SyntaxError("invalid JSON");}};
  if (mode === "null-response") return {ok:true,json:async()=>null};
  return {ok:true,json:async()=>({access_token:"access",id_token:"header."+Buffer.from(JSON.stringify({sub:"reader",name:"علی Zoë 🌍"})).toString("base64url")+".signature",expires_in:3600})};
};
const { beginSignIn, completeSignIn } = await import("./auth/flow.ts");
const params = new URLSearchParams({code:"code",state:mode === "wrong-state" ? "wrong" : "expected"});
try {
  if (mode === "replay") {
    let cancelled = false;
    let redirects = 0;
    let error = null;
    const first = (async()=>{ const result=await completeSignIn(params); if(cancelled)return; if(result.ok)redirects++;else error=result.reason; })();
    cancelled = true;
    const second = (async()=>{ const result=await completeSignIn(new URLSearchParams(params)); if(result.ok)redirects++;else error=result.reason; })();
    await Promise.all([first,second]);
    const settledReplay = await completeSignIn(new URLSearchParams(params));
    console.log(JSON.stringify({redirects,error,exchanges,settledReplay}));
  } else if (mode === "new-flow") {
    await completeSignIn(params);
    globalThis.window = {location:{assign(){}}};
    await beginSignIn("/next");
    const state = JSON.parse(values.get("ksor.oauth.pending")).state;
    const result = await completeSignIn(new URLSearchParams({code:"next-code",state}));
    console.log(JSON.stringify({result,exchanges}));
  } else {
    const result = await completeSignIn(params);
    console.log(JSON.stringify({result,exchanges,session:JSON.parse(values.get("ksor.session") ?? "null")}));
  }
} catch (error) { console.log(JSON.stringify({threw:error.message,exchanges})); }
`;

interface Outcome {
  readonly threw?: string;
  readonly result?: { readonly ok: boolean; readonly reason?: string };
  readonly settledReplay?: { readonly ok: boolean };
  readonly session?: { readonly name: string } | null;
  readonly exchanges: number;
  readonly redirects?: number;
  readonly error?: string | null;
}

describe("the shipped sign-in callback", () => {
  let root = "";
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "ksor-auth-flow-"));
    mkdirSync(path.join(root, "auth"));
    for (const file of readdirSync(AUTH)) {
      const text = readFileSync(path.join(AUTH, file), "utf8");
      writeFileSync(
        path.join(root, "auth", file),
        text.replace(/(from "\.\/[\w-]+)(")/g, "$1.ts$2"),
      );
    }
    writeFileSync(path.join(root, "run.mjs"), HARNESS);
  });
  afterAll(() => {
    if (root !== "") rmSync(root, { recursive: true, force: true });
  });

  function run(mode: string): Outcome {
    const result = spawnSync(process.execPath, [path.join(root, "run.mjs"), mode], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as Outcome;
  }

  it("finishes after an effect cleanup and replay, redeeming the code once", () => {
    const result = run("replay");
    expect(result, JSON.stringify(result)).toMatchObject({
      redirects: 1,
      error: null,
      exchanges: 1,
      settledReplay: { ok: true },
    });
  });

  it("preserves UTF-8 names from identity claims", () => {
    const result = run("unicode");
    expect(result.session?.name, JSON.stringify(result)).toBe("علی Zoë 🌍");
  });

  it("allows a new sign-in after a completed callback", () => {
    const result = run("new-flow");
    expect(result, JSON.stringify(result)).toMatchObject({ result: { ok: true }, exchanges: 2 });
  });

  for (const mode of [
    "network",
    "bad-json",
    "null-response",
    "malformed-state",
    "invalid-state",
    "blocked-read",
    "blocked-write",
  ]) {
    it(`returns a recoverable failure for ${mode}`, () => {
      const result = run(mode);
      expect(result.threw, JSON.stringify(result)).toBeUndefined();
      expect(result.result?.ok, JSON.stringify(result)).toBe(false);
      expect(result.result?.reason, JSON.stringify(result)).toMatch(
        /try again|sign in again|allow.*storage/i,
      );
      expect(result.session, JSON.stringify(result)).toBeNull();
    });
  }

  it("refuses a mismatched state without redeeming the code", () => {
    const result = run("wrong-state");
    expect(result, JSON.stringify(result)).toMatchObject({ result: { ok: false }, exchanges: 0 });
  });
});
