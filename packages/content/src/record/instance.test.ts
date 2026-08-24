import { describe, expect, it } from "vitest";

import { parseInstanceDocument } from "./instance.js";

const BASE = `---
format: 2
name: acme
title: Acme handbook
description: The governed handbook of Acme.
toolchain:
  requires: ">=0.1.0"
  scaffolded: "0.1.0"
database:
  dsn_env: KSOR_DB_URL
mcp_url: https://records.example.com/mcp
version: 0.1.0
---

Answer only from the record.

Second paragraph is instructions too.
`;

function slugs(text: string): string[] {
  const r = parseInstanceDocument(text);
  return r.ok ? [] : r.refusals.map((x) => `${x.slug}: ${x.why}`);
}

describe("parseInstanceDocument — instance.md format 2 (record spec §3)", () => {
  it("reads identity, display title, description, the stamp, the deployment keys and the WHOLE body", () => {
    const r = parseInstanceDocument(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.instance.name).toBe("acme");
    expect(r.instance.title).toBe("Acme handbook");
    expect(r.instance.description).toBe("The governed handbook of Acme.");
    expect(r.instance.toolchain).toEqual({ requires: ">=0.1.0", scaffolded: "0.1.0" });
    expect(r.instance.database).toEqual({ dsn_env: "KSOR_DB_URL" });
    expect(r.instance.mcpUrl).toBe("https://records.example.com/mcp");
    expect(r.instance.version).toBe("0.1.0");
    expect(r.instance.instructions).toBe(
      "Answer only from the record.\n\nSecond paragraph is instructions too.",
    );
  });

  it("the deployment keys are optional — the level-0 shape declares none", () => {
    const r = parseInstanceDocument(
      "---\nformat: 2\nname: a\ntitle: A\ndescription: D.\n---\nBody\n",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.instance.database).toBeNull();
  });

  it("ksor-instance-format: format 1 is the pre-profile instance", () => {
    expect(slugs(BASE.replace("format: 2", "format: 1"))).toEqual([
      expect.stringMatching(/^ksor-instance-format: `format: 1`/),
    ]);
  });

  it("ksor-instance-format: audiences, default_visibility and ksor: are refused with the hint to move them", () => {
    for (const moved of [
      "audiences: [public]",
      "default_visibility: public",
      "ksor:\n  requires: x",
    ]) {
      const out = slugs(BASE.replace("mcp_url:", `${moved}\nmcp_url:`));
      expect(out, moved).toHaveLength(1);
      expect(out[0]).toMatch(/ksor-instance-format: `.*` no longer live on the instance/);
    }
  });

  it("ksor-instance-format: the key set is closed, and a missing floor key is named", () => {
    expect(slugs(BASE.replace("mcp_url:", "retreival: 0.6\nmcp_url:"))).toEqual([
      expect.stringMatching(/unknown top-level key: retreival/),
    ]);
    expect(slugs(BASE.replace("title: Acme handbook\n", ""))).toEqual([
      expect.stringMatching(/^ksor-instance-format: `title`/),
    ]);
    expect(slugs(BASE.replace("name: acme", "name: Acme Handbook"))).toEqual([
      expect.stringMatching(/^ksor-instance-format: `name`.*identity/),
    ]);
  });

  it("no frontmatter at all is refused, and an unclosed fence is the frontmatter's own refusal", () => {
    expect(slugs("# Just a body\n")).toEqual([expect.stringMatching(/no frontmatter/)]);
    const r = parseInstanceDocument("---\nformat: 2\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals[0]?.slug).toBe("ksor-frontmatter-invalid");
  });
});
