/**
 * The fixtures the agent tier runs, and the pure graders that read what an
 * agent wrote. One table — fixture, prompt, the outcome class a correct run
 * belongs to, and the gates that apply — so a new fixture is a row here and
 * nothing in the harness.
 *
 * Pure on purpose: the body gates read a string and return grades, so the
 * unit tier can mutation-test each one — smooth the two statements, misread
 * the figure, drop a row, keep the footer — and watch exactly one gate go
 * red. The act gates (files touched, the build, `verify.mjs`) live in the
 * agent suite, because they need a scaffold.
 *
 * WHY A SECOND AND THIRD FIXTURE. Three armed runs on the clean two-page PDF
 * (`SKILL_BASELINE` rows 1–3) showed both arms passing every deterministic
 * gate: a harness that cannot tell the arms apart is measuring the fixture,
 * not the skill. So the hard fixture is built out of the acts a careless
 * conversion gets wrong and a deterministic gate can see — and the scanned
 * one out of the act the skill forbids outright.
 */

export interface Grade {
  readonly name: string;
  readonly pass: boolean;
  readonly saw: string;
}

/** What a correct run leaves behind: a document, or nothing and a message. */
export type Outcome = "converted" | "refused";

export interface SkillCase {
  /** The file dropped into the scaffold's `src/`, and the name the prompt uses. */
  readonly fixture: string;
  /**
   * The committed extraction the graders verify against (`pdftotext -layout`
   * of the fixture, byte for byte). For the scanned fixture it is what the
   * PICTURE says — the text it was rasterised from — so a document written
   * from the picture can be checked for what the eye misread.
   */
  readonly extraction: string;
  readonly prompt: string;
  readonly outcome: Outcome;
  /** Running headers, footers and page numbers that must not survive into the body. */
  readonly furniture: readonly RegExp[];
  /** Gates this fixture was built to carry, beyond the common set. */
  readonly extra: (body: string) => readonly Grade[];
}

/**
 * The prompt tutorial 2 gives the reader, plus the owner's standing answers.
 *
 * The second armed run (2026-09-02) taught why the second sentence exists.
 * Given the tutorial's prompt alone, the WITH-skill agent extracted the PDF,
 * compared it against the page, found two things it must not invent — the
 * source names no currency, and the emitted AGENTS.md says audience is "never
 * omitted, never inferred" — and STOPPED to ask the owner, writing nothing.
 * The baseline guessed an owner ("a guess"), chose `[public]` unasked, and
 * proceeded: 9/9 gates against 4/9. That is the skill behaving correctly and
 * the harness misreading it, because a one-shot `claude -p` has no owner to
 * answer. In tutorial 2 the owner is there and answers in a sentence. So the
 * harness says what that owner would, once — and the report still names a
 * run that paused for the owner rather than scoring it as silence.
 */
export function prompt(fixture: string): string {
  return (
    `Here is our expense policy, \`src/${fixture}\`. Add it to the record under ` +
    "`finance/`, and tell me what it leaves open. The record has one audience, public. " +
    "Where the source leaves something unstated, write it into the document as an open " +
    "question rather than asking me — I will review the page on the site."
  );
}

/** Case-folded, whitespace-collapsed: an extraction shouts and wraps, a table row is one line. */
const fold = (s: string): string => s.toLowerCase().replace(/\s+/g, " ");

/**
 * Is `needle` within `within` characters after some occurrence of `anchor`?
 * A table row, a bullet and a sentence all keep a city and its figures that
 * close; a transposed table would not, and would be a gate to revisit.
 */
function near(folded: string, anchor: string, needle: string, within = 200): boolean {
  for (let at = folded.indexOf(anchor); at !== -1; at = folded.indexOf(anchor, at + 1)) {
    if (folded.slice(at, at + within).includes(needle)) return true;
  }
  return false;
}

const PAGE_NUMBER = /Page \d+ of \d+/;
/**
 * Neither fixture names a currency. Run 2's WITH arm stopped rather than
 * invent one; a document that says € or CHF filled a gap from general
 * knowledge, which is the one thing add-sources must never do. The hard
 * fixture's cities sit in four currency zones, so there is no right guess.
 */
const CURRENCY = /[$£€]|\b(USD|GBP|EUR|CHF|PLN|CZK|PKR|INR|AUD|CAD)\b/;

const STATEMENT_A = "10 working days";
const STATEMENT_B = "ten (10) business days";
const CITIES = ["berlin", "vienna", "zurich", "prague", "warsaw"] as const;
/**
 * The figures the source writes with a thousands separator, other than
 * Zurich's cap (the pair gate owns that one). `verify.mjs` catches a bare
 * `2500` at the act level — "10,000 and 10000 are different claims" — but the
 * unit tier cannot run it, and a decimal-point misread (`2.500`) is a figure
 * a European eye writes without noticing; both forms are named here so the
 * mutation that produces them has one gate to turn red. `1,000` has no dotted
 * form to forbid: `1.000` is the source's own hardship factor.
 */
const SEPARATED = [
  { n: "2,500", wrong: ["2500", "2.500"] },
  { n: "1,100", wrong: ["1100", "1.100"] },
  { n: "1,000", wrong: ["1000"] },
] as const;

/** Does `form` occur in `folded` as a whole figure — not inside 12,500 or 1,000.5? */
const figure = (folded: string, form: string): boolean =>
  new RegExp(`(?<![\\d.,])${form.replace(".", "\\.")}(?![\\d.,])`).test(folded);

export const CASES: readonly SkillCase[] = [
  {
    // The clean two-page PDF the first three runs used: prose, two thresholds,
    // one name, page numbers. Kept so the rows stay comparable.
    fixture: "expense-policy.pdf",
    extraction: "expense-policy.txt",
    prompt: prompt("expense-policy.pdf"),
    outcome: "converted",
    furniture: [PAGE_NUMBER],
    extra: () => [],
  },
  {
    // Built so a careless conversion fails a deterministic gate: a five-row
    // rates table (a dropped row is a value verify.mjs cannot see missing);
    // the payment window stated twice and differently, §2 and §5, which the
    // skill says stays two statements, flagged; `1,250` beside `1.250` on one
    // row, where a misread makes them equal and verify.mjs — a substring
    // check, and both strings ARE in the source — cannot tell; three figures
    // with a thousands separator; and a running footer on both pages.
    fixture: "expense-policy-hard.pdf",
    extraction: "expense-policy-hard.txt",
    prompt: prompt("expense-policy-hard.pdf"),
    outcome: "converted",
    furniture: [PAGE_NUMBER, /uncontrolled when printed/i],
    extra: (body) => {
      const f = fold(body);
      const hasA = f.includes(STATEMENT_A);
      const hasB = f.includes(STATEMENT_B);
      const flagged = /open question/i.test(body);
      const zurich = f.indexOf("zurich");
      const missingCities = CITIES.filter((c) => !f.includes(c));
      const separators = SEPARATED.map(({ n, wrong }) => ({
        n,
        present: f.includes(n),
        wrong: wrong.find((form) => figure(f, form)),
      }));
      return [
        {
          name: `both statements of the payment window survive (${STATEMENT_A}; ${STATEMENT_B})`,
          pass: hasA && hasB,
          saw:
            `"${STATEMENT_A}": ${hasA ? "present" : "MISSING"}; "${STATEMENT_B}": ` +
            `${hasB ? "present" : "MISSING"}; flagged as an open question: ${flagged ? "yes" : "no"}`,
        },
        {
          name: "the misreadable pair survives distinct (Zurich: 1,250 beside 1.250)",
          pass: near(f, "zurich", "1,250") && near(f, "zurich", "1.250"),
          saw: zurich === -1 ? "(no Zurich row)" : f.slice(zurich, zurich + 90).trim(),
        },
        {
          name: "every row of the rates table survives (five cities)",
          pass: missingCities.length === 0,
          saw: missingCities.length === 0 ? "all five" : `missing ${missingCities.join(", ")}`,
        },
        {
          name: `the thousands separators survive (${SEPARATED.map((s) => s.n).join("; ")})`,
          pass: separators.every((s) => s.present && s.wrong === undefined),
          saw: separators
            .map(
              (s) =>
                `${s.n}: ${s.present ? "present" : "MISSING"}` +
                (s.wrong === undefined ? "" : ` (saw ${s.wrong})`),
            )
            .join("; "),
        },
      ];
    },
  },
  {
    // The hard policy rasterised: two pages of picture and no text layer. The
    // skill says an empty extraction means stop and tell the owner — "do not
    // OCR it and hope" — so the correct run writes nothing. What a baseline
    // does with it is the finding.
    fixture: "scanned-policy.pdf",
    extraction: "expense-policy-hard.txt",
    prompt: prompt("scanned-policy.pdf"),
    outcome: "refused",
    furniture: [],
    extra: () => [],
  },
];

/**
 * The gates on the document itself, for a `converted` case: frontmatter gates
 * read the frontmatter, content gates read the body below it — the same split
 * `verify.mjs` makes, because the frontmatter's title and description are the
 * agent's own words by design. A `refused` case has no document to grade.
 */
export function bodyGates(kase: SkillCase, file: string): readonly Grade[] {
  if (kase.outcome === "refused") return [];
  const fm = /^---\n([\s\S]*?)\n---/.exec(file)?.[1] ?? "";
  const body = file.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const furniture = kase.furniture.map((re) => re.exec(body)?.[0]).find((m) => m !== undefined);
  const currency = CURRENCY.exec(body)?.[0];
  return [
    {
      name: "status: draft",
      pass: /^status:\s*draft\s*$/m.test(fm),
      saw: /^status:.*$/m.exec(fm)?.[0] ?? "(no status)",
    },
    {
      name: "sources present",
      pass: /^sources:/m.test(fm),
      saw: /^sources:/m.test(fm) ? "yes" : "no",
    },
    {
      name: "no id:/name: (the path is the identity)",
      pass: !/^(id|name):/m.test(fm),
      saw: /^(id|name):.*$/m.exec(fm)?.[0] ?? "none",
    },
    {
      name: "page furniture stripped",
      pass: furniture === undefined,
      saw: furniture ?? "none",
    },
    {
      name: "no currency invented (the source names none)",
      pass: currency === undefined,
      saw: currency ?? "none",
    },
    ...kase.extra(body),
  ];
}

/**
 * The gates for a `refused` case. `wrote` is what the act gates learned about
 * a document that should not exist — which file, and what `verify.mjs` found
 * when it was checked against the text the picture was made from.
 */
export function refusalGates(
  text: string,
  touched: readonly string[],
  wrote?: string,
): readonly Grade[] {
  const told = /text layer|scanned|image-only/i.exec(text)?.[0];
  return [
    {
      name: "wrote nothing",
      pass: touched.length === 0,
      saw: touched.length === 0 ? "(nothing)" : (wrote ?? touched.join(", ")),
    },
    {
      name: "told the owner the PDF has no text layer",
      pass: told !== undefined,
      saw: told === undefined ? text.replace(/\s+/g, " ").slice(0, 120) : `"${told}"`,
    },
  ];
}
