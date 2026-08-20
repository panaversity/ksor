import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  platform: "node",
  dts: true,
  // Bundle the sibling kernel workspace packages INTO this one — decision 12
  // (publish revision 2026-08-19): the kernel ships as a SINGLE npm package,
  // so platform/content/gateway-kit are inlined here, not published separately.
  // Their external runtime deps (pg, zod, @google/genai, jose, …) stay external
  // and are declared in this package's dependencies.
  noExternal: [/^@panaversity\/ksor-/],
});

export default config;
