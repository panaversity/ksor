import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * Sign-in on the site, asserted on the SHIPPED bytes.
 *
 * The flow itself was walked in a browser against a real Auth0 tenant before
 * this landed — redirect, consent, callback, session, sign-out, a planted code
 * refused, and an issuer error rendered. What a suite can hold cheaply is the
 * part that would rot silently: that the control is ABSENT unless configured,
 * that a root `.env` reaches the bundle, and that the callback page is emitted
 * as a static file.
 */

const distCli = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "dist",
  "cli.mjs",
);

let workDirs: string[] = [];
afterEach(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
  workDirs = [];
});

/**
 * A file's CODE, with comments removed.
 *
 * Every one of these files EXPLAINS in prose why it avoids localStorage, or a
 * client secret, or `credentials: "include"` — which is exactly the
 * documentation that should be there, and exactly what makes a naive
 * `not.toContain` fail on the source that gets it right.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function scaffold(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-siteauth-"));
  workDirs.push(dir);
  const result = spawnSync(process.execPath, [distCli, "init", "demo"], {
    cwd: dir,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return path.join(dir, "demo");
}

describe("the site's sign-in control", () => {
  it("ships with the scaffold, and reads the three variables it needs", () => {
    const project = scaffold();
    for (const file of [
      "system/site/lib/auth/config.ts",
      "system/site/lib/auth/pkce.ts",
      "system/site/lib/auth/flow.ts",
      "system/site/lib/auth/session.ts",
      "system/site/lib/auth/discovery.ts",
      "system/site/components/sign-in.tsx",
      "system/site/app/auth/callback/page.tsx",
    ]) {
      expect(existsSync(path.join(project, file)), `missing ${file}`).toBe(true);
    }
    const config = readFileSync(path.join(project, "system/site/lib/auth/config.ts"), "utf8");
    for (const name of [
      "NEXT_PUBLIC_KSOR_SSO_URL",
      "NEXT_PUBLIC_KSOR_OAUTH_CLIENT_ID",
      "NEXT_PUBLIC_KSOR_OAUTH_REDIRECT_URI",
    ]) {
      expect(config, `config must read ${name}`).toContain(name);
    }
  });

  // The scaffold's promise is ONE .env at the root, because that is where the
  // CLI reads it. The site builds in system/site, so Next would never see it —
  // an adopter following the instructions would set variables that silently
  // never reach the bundle. Found live before this shipped.
  it("reads the ROOT .env, which is the only one the scaffold tells you to make", () => {
    const project = scaffold();
    const config = readFileSync(path.join(project, "system/site/next.config.mjs"), "utf8");
    expect(config, "the site build must load the repo-root .env").toContain("loadRootEnv");
    expect(config).toContain('readFileSync(path.join(repoRoot, ".env")');
    // A real environment variable still wins — the precedence the CLI states.
    expect(config).toContain("process.env[match[1]] === undefined");
  });

  it("names the three variables in env.example, and says what they do NOT do", () => {
    const project = scaffold();
    const example = readFileSync(path.join(project, ".env.example"), "utf8");
    expect(example).toContain("NEXT_PUBLIC_KSOR_SSO_URL");
    expect(example).toContain("NEXT_PUBLIC_KSOR_OAUTH_CLIENT_ID");
    expect(example).toContain("NEXT_PUBLIC_KSOR_OAUTH_REDIRECT_URI");
    // The claim that must never be lost: it names a reader, it does not gate.
    expect(example.toLowerCase()).toContain("does not restrict reading");
  });

  // Endpoints are DISCOVERED. Hardcoding one vendor's paths would work against
  // Auth0 and fail against the next, which is the opposite of the claim this
  // project makes — and the door already discovers the same way.
  it("discovers the issuer's endpoints rather than assuming a vendor's paths", () => {
    const project = scaffold();
    const discovery = readFileSync(path.join(project, "system/site/lib/auth/discovery.ts"), "utf8");
    expect(discovery).toContain("/.well-known/oauth-authorization-server");
    expect(discovery).toContain("/.well-known/openid-configuration");
    const flow = code(path.join(project, "system/site/lib/auth/flow.ts"));
    expect(flow, "the flow must not hardcode an authorize path").not.toContain("/authorize`");
    expect(flow, "the flow must not hardcode a token path").not.toContain("/oauth/token`");
  });

  it("uses PKCE with S256, and sends no client secret", () => {
    const project = scaffold();
    const flow = code(path.join(project, "system/site/lib/auth/flow.ts"));
    expect(flow).toContain("code_challenge_method");
    expect(flow).toContain("S256");
    expect(flow).toContain("code_verifier");
    // A public client has no secret to send, and sending cookies is refused by
    // browsers against a wildcard CORS origin.
    expect(flow).not.toContain("client_secret");
    expect(flow).not.toContain('credentials: "include"');
  });

  it("checks state before redeeming a code", () => {
    const project = scaffold();
    const flow = code(path.join(project, "system/site/lib/auth/flow.ts"));
    const stateCheck = flow.indexOf('params.get("state") !== pending.state');
    const tokenPost = flow.indexOf("grant_type");
    expect(stateCheck, "state must be compared").toBeGreaterThan(-1);
    expect(stateCheck, "state must be checked BEFORE the code is sent anywhere").toBeLessThan(
      tokenPost,
    );
  });

  // sessionStorage, not localStorage: the token grants nothing on this site, so
  // the blast radius should match the benefit. The predecessor kept 14-day
  // tokens in localStorage; that is what this deliberately does not do.
  it("keeps the session per-tab, and asks for no refresh token", () => {
    const project = scaffold();
    const session = code(path.join(project, "system/site/lib/auth/session.ts"));
    expect(session).toContain("sessionStorage");
    expect(session).not.toContain("localStorage");
    const config = code(path.join(project, "system/site/lib/auth/config.ts"));
    expect(config, "offline_access would mint a refresh token").not.toContain("offline_access");
  });

  it("renders nothing at all when the record configures no issuer", () => {
    const project = scaffold();
    const control = readFileSync(path.join(project, "system/site/components/sign-in.tsx"), "utf8");
    expect(control).toContain("if (authConfig === null) return null");
  });
});
