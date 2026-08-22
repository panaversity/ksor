import http from "node:http";
import { generateKeyPair, exportJWK, SignJWT, exportPKCS8 } from "jose";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2];
const AS_PORT = 39200;
const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = await exportJWK(publicKey);
jwk.kid = "k1";
jwk.alg = "RS256";
jwk.use = "sig";

// A SECOND keypair the server never trusts (for forgery probes)
const evil = await generateKeyPair("RS256", { extractable: true });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${AS_PORT}`);
  if (u.pathname === "/.well-known/oauth-authorization-server") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        issuer: `http://127.0.0.1:${AS_PORT}`,
        jwks_uri: `http://127.0.0.1:${AS_PORT}/jwks`,
      }),
    );
  }
  if (u.pathname === "/jwks") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ keys: [jwk] }));
  }
  res.writeHead(404);
  res.end("no");
});
server.listen(AS_PORT, "127.0.0.1", async () => {
  const mint = async (claims, key = privateKey, kid = "k1", alg = "RS256") =>
    new SignJWT(claims).setProtectedHeader({ alg, kid }).setIssuedAt().sign(key);
  const AUD = "http://127.0.0.1:39113/mcp";
  const good = await mint({
    sub: "user-1",
    aud: AUD,
    exp: Math.floor(Date.now() / 1000) + 3600,
    azp: "probe-client",
    tenant_id: "acme-handbook",
  });
  const wrongAud = await mint({
    sub: "user-1",
    aud: "http://other/mcp",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const expired = await mint({ sub: "user-1", aud: AUD, exp: Math.floor(Date.now() / 1000) - 10 });
  const forged = await mint(
    { sub: "admin", aud: AUD, exp: Math.floor(Date.now() / 1000) + 3600 },
    evil.privateKey,
  );
  const audList = await mint({
    sub: "u2",
    aud: ["http://elsewhere/x", AUD],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const noSub = await mint({ aud: AUD, exp: Math.floor(Date.now() / 1000) + 3600 });
  // alg none / HS256 forged with the public key material as HMAC secret
  const pubPem = JSON.stringify(jwk);
  writeFileSync(
    OUT,
    JSON.stringify({ good, wrongAud, expired, forged, audList, noSub, AUD }, null, 1),
  );
  console.log("AS ready");
});
