// Ship content's schema.sql WITH the bundled CLI. The bundled content code
// resolves it via import.meta.url as <pkg>/schema/schema.sql; copy the DDL
// there at build time. `files` ships it; it is gitignored (a build artifact).
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "schema"), { recursive: true });
cpSync(join(here, "..", "content", "schema", "schema.sql"), join(here, "schema", "schema.sql"));
