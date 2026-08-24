// Copy the built checker (tsdown's second entry, dist/checker/check-main.mjs)
// into BOTH skill trees of the scaffold template. The scaffold ships each
// skill twice, byte-identical (guard rule 9; the emitted project's own
// `pnpm check` holds the two trees equal), and the checker is a build product
// gitignored in the templates — like schema/ — so the only copy that exists
// is the one this build made from the record module.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, "dist", "checker", "check-main.mjs");
const raw = readFileSync(built, "utf8");
if (!raw.startsWith("// GENERATED")) {
  throw new Error(`emit-checker: ${built} does not carry the generated banner`);
}
// rolldown's `//#region <path>` markers name this workspace's `.pnpm` store
// paths; the emitted project is manager-neutral (decision 25) and its
// conformance test asserts no `pnpm` token survives in a non-pnpm scaffold.
const text = raw
  .split("\n")
  .filter((line) => !line.startsWith("//#region") && !line.startsWith("//#endregion"))
  .join("\n");
if (/pnpm/.test(text)) {
  throw new Error(
    "emit-checker: the checker mentions pnpm — the emitted scaffold is manager-neutral",
  );
}
for (const tree of [".agents", ".claude"]) {
  const dir = join(here, "templates", "scaffold", tree, "skills", "format-checker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "check.mjs"), text);
}
