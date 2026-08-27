import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/record/index.ts"],
  platform: "node",
  dts: true,
});

export default config;
