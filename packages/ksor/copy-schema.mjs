// Ship content's schema/ directory WITH the bundled CLI. The bundled content
// code resolves it via import.meta.url as <pkg>/schema/schema.sql and
// <pkg>/schema/migrations/; copy the WHOLE directory at build time — copying
// only schema.sql shipped a CLI whose `schema --apply` could provision a fresh
// database but threw ENOENT the moment it had to migrate an existing one.
// `files` ships it; it is gitignored (a build artifact).
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "schema"), { recursive: true });
cpSync(join(here, "..", "content", "schema"), join(here, "schema"), { recursive: true });
