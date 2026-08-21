// Ship content's schema.sql WITH this bundled kernel package. The bundled
// content code resolves it via import.meta.url as <pkg>/schema/schema.sql
// (dist/.. /schema), so copy the DDL there at build time; `files` includes
// "schema" so it ships, and it is gitignored (a build artifact, like dist).
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "schema"), { recursive: true });
cpSync(join(here, "..", "content", "schema"), join(here, "schema"), { recursive: true });
