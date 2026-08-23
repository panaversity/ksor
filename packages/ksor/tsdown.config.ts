import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/gateway.ts"],
  platform: "node",
  dts: true,
  // ONE package (decision 12, publish revision 2026-08-20): the kernel is
  // bundled INTO the CLI — platform/content/gateway-kit/content-gateway are
  // inlined here, never published separately. Their external runtime deps
  // (pg, @google/genai, the MCP SDK, hono, jose, zod) are this package's deps.
  noExternal: [/^@panaversity\/ksor-/],
});

export default config;
