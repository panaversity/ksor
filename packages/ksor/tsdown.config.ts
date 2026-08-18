import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  platform: "node",
  dts: true,
});

export default config;
