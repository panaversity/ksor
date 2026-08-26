import { describe, expect, it } from "vitest";

import { parseYamlFile } from "./yaml-file.js";

const P = ".ksor/governance.yaml";
const SLUG = "ksor-policy-invalid";

function valueOf(text: string): Readonly<Record<string, unknown>> {
  const r = parseYamlFile(text, P, SLUG);
  if (!r.ok) throw new Error(JSON.stringify(r.refusals));
  return r.value;
}

/**
 * The refusal's `why` — or what the reader TOOK instead, so a failure prints
 * the shape that got through rather than a bare `null`.
 */
function whyOf(text: string): string {
  const r = parseYamlFile(text, P, SLUG);
  if (!r.ok) return r.refusals[0]?.why ?? "";
  const shown = JSON.stringify(r.value, (_k, v: unknown) =>
    v instanceof Set || v instanceof Map ? `[${v.constructor.name}]` : v,
  );
  return `TAKEN: ${shown}`;
}

describe("parseYamlFile — the control-file reader", () => {
  it("reads a mapping, and an empty file is an empty mapping", () => {
    expect(valueOf('version: "0.1"\nactors: [human:a]\n')).toEqual({
      version: "0.1",
      actors: ["human:a"],
    });
    expect(valueOf("")).toEqual({});
    expect(valueOf("# only a comment\n")).toEqual({});
  });

  it("refuses a second document, a duplicate key, unreadable YAML, and a non-mapping root", () => {
    expect(whyOf("a: 1\n---\nb: 2\n")).toBe("the file holds more than one YAML document");
    expect(whyOf("a: 1\na: 2\n")).toMatch(/not valid YAML: Map keys must be unique/);
    expect(whyOf("a: [\n")).toMatch(/not valid YAML/);
    expect(whyOf("- a\n- b\n")).toBe("the file is not a mapping at its root");
    expect(whyOf("just a scalar\n")).toBe("the file is not a mapping at its root");
  });

  it("refuses an unknown tag rather than resolving it to something no reader expects", () => {
    expect(whyOf("a: !Foo {}\n")).toMatch(/not valid YAML: Unresolved tag/);
  });

  /** `toJS()` throws `ReferenceError: Excessive alias count` — caught, not crashed. */
  it("refuses an alias bomb instead of expanding it", () => {
    let bomb = "a: &a [x,x,x,x,x,x,x,x,x]\n";
    for (const letter of "bcdefghij") {
      const prev = String.fromCharCode(letter.charCodeAt(0) - 1);
      bomb += `${letter}: &${letter} [${Array(9).fill(`*${prev}`).join(",")}]\n`;
    }
    expect(whyOf(bomb)).toMatch(/Excessive alias count/);
  });

  /**
   * The gap this suite was written for. `schema: "core"` does NOT refuse the
   * YAML 1.1 type tags — `!!binary` resolves to a Buffer, `!!set` to a Set,
   * `!!omap` to a Map, with no error and no warning — and the root-only
   * mapping check never looks at a VALUE. So a control file could carry an
   * object no rule in this codebase expects: `zod` would reject the ones it
   * validates, but `Policy.raw` is published verbatim and a Buffer reaching a
   * surface is a shape nothing downstream is written against (2026-08-25
   * review). The frontmatter reader already walked for this; the two control
   * files that decide authority and denial did not.
   */
  it("refuses a `!!tag` value that is not plain data, at any depth", () => {
    expect(whyOf("a: !!binary aGk=\n")).toMatch(/`a` is not plain data/);
    expect(whyOf("a: !!set { x: null }\n")).toMatch(/`a` is not plain data/);
    expect(whyOf("a: !!omap\n  - x: 1\n")).toMatch(/`a` is not plain data/);
    expect(whyOf("ownership:\n  - owner: !!binary aGk=\n")).toMatch(
      /`ownership\[0\]\.owner` is not plain data/,
    );
    expect(whyOf("a:\n  b:\n    - !!binary aGk=\n")).toMatch(/`a\.b\[0\]` is not plain data/);
  });

  it("takes every plain shape the control files really use", () => {
    expect(
      valueOf(`version: "0.1"
audiences:
  internal:
    description: Staff
ownership:
  - scope: { paths: ["hr/"] }
    owner: team:hr
takedown_authorities:
  actors: [human:a, human:b]
`),
    ).toMatchObject({ ownership: [{ scope: { paths: ["hr/"] }, owner: "team:hr" }] });
  });

  /**
   * Pinned because each is a behaviour a reader would otherwise have to guess
   * at, and all three were checked against `yaml` 2.9.0 rather than assumed.
   * `__proto__` is the good news: `yaml` assigns with `Object.defineProperty`,
   * so it lands as an ordinary own key and pollutes nothing.
   */
  it("pins what core resolution does with the forms a hand-edited file reaches for", () => {
    const proto = valueOf("__proto__:\n  polluted: yes\n");
    expect(Object.keys(proto)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();

    // A merge key is NOT merged: it survives as a literal `<<` key, which every
    // closed-key walk in the record module then refuses by name.
    expect(valueOf("x: &a { p: 1 }\ny:\n  <<: *a\n  q: 2\n")["y"]).toEqual({
      "<<": { p: 1 },
      q: 2,
    });

    // Core resolution, not the failsafe schema's strings.
    expect(valueOf("a: .inf\nb: 0x1f\nc: 0o17\nd: 2026-01-01\n")).toEqual({
      a: Number.POSITIVE_INFINITY,
      b: 31,
      c: 15,
      d: "2026-01-01",
    });
  });

  it("refuses under the caller's own slug and path", () => {
    const r = parseYamlFile("- a\n", ".ksor/takedowns.yaml", "ksor-ledger-invalid");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals).toHaveLength(1);
    expect(r.refusals[0]?.slug).toBe("ksor-ledger-invalid");
    expect(r.refusals[0]?.path).toBe(".ksor/takedowns.yaml");
  });
});
