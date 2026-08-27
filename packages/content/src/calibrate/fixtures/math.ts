// GENERATED from ./math.json — the oracle record produced against the Python
// truth (sor_content.calibrate @ b554f91) by the scratchpad script
// gen_calibrate_fixtures.py under uv. Do not hand-edit: regenerate the JSON
// and re-inline. Inlined as a module because tsconfig.base.json does not
// enable resolveJsonModule, so a JSON import does not typecheck here.
import type {
  CalibrationReport,
  FloorRecommendation,
  FloorStats,
  ReportMeta,
  Scored,
  ScoredQuery,
} from "../math.js";

export interface StatsExpectation {
  floor: number;
  expected: FloorStats;
}

export interface RecommendExpectation {
  requested_target: number;
  expected: FloorRecommendation;
}

export interface PasteExpectation {
  value: number;
  why: string;
}

export interface MathCase {
  name: string;
  points: Scored[];
  stats: StatsExpectation[];
  curve: FloorStats[];
  aurc: number;
  aurc_round4: number;
  recommend: RecommendExpectation[];
  paste: PasteExpectation | null;
}

export interface PasteErrorCase {
  name: string;
  points: Scored[];
  error: string;
}

export interface ReportCase {
  name: string;
  detail: ScoredQuery[];
  meta: ReportMeta;
  target_precision: number;
  expected: CalibrationReport;
  rendered: string;
}

export interface FormatCase {
  value: number;
  round3: number;
  round4: number;
  fixed3: string;
  repr: string;
}

export interface RequireScoreCase {
  query: string;
  error: string;
}

export interface MathFixture {
  _provenance: string;
  built_in_ooc: string[];
  queries_file_caveat: string;
  math_cases: MathCase[];
  paste_errors: PasteErrorCase[];
  report_cases: ReportCase[];
  format_cases: FormatCase[];
  require_score_cases: RequireScoreCase[];
}

export const fixture: MathFixture = {
  _provenance:
    "Generated from sor_content.calibrate @ b554f91 by scratchpad/gen_calibrate_fixtures.py (uv run --no-sync). Byte-identical oracle output except require_score_cases, where 'scored None' -> 'scored null' (recorded substitution: the TS value is null).",
  built_in_ooc: [
    "What's for dinner tonight?",
    "How do I file my taxes?",
    "Who won the football game yesterday?",
    "What's the weather this weekend?",
    "How do I unclog a kitchen sink?",
    "Best pizza place near me?",
    "How do I renew my passport?",
    "What time does the mall close?",
    "Is it going to rain in Lahore tomorrow?",
    "How do I reset my wifi router?",
    "What's a good gift for a five year old?",
    "How long do I boil an egg?",
    "Which phone should I buy this year?",
    "How do I get red wine out of a carpet?",
    "What's the capital of Australia?",
    "How much water should I drink per day?",
    "Why is my car making a clicking noise?",
    "How do I train a puppy not to bite?",
    "What movies are playing this week?",
    "How do I write a resignation letter?",
  ],
  queries_file_caveat:
    "CAVEAT: --queries-file floors are measured on human/gold-derived queries — section-weighted eval targets, NOT per-node passage samples — so this floor's low tail is a different distribution than the synthesized door's; record 'door: queries-file' beside the number and never compare the two doors' floors as interchangeable.",
  math_cases: [
    {
      name: "hand-computed overlap",
      points: [
        {
          score: 0.6,
          in_corpus: true,
        },
        {
          score: 0.65,
          in_corpus: true,
        },
        {
          score: 0.7,
          in_corpus: true,
        },
        {
          score: 0.8,
          in_corpus: true,
        },
        {
          score: 0.3,
          in_corpus: false,
        },
        {
          score: 0.4,
          in_corpus: false,
        },
        {
          score: 0.55,
          in_corpus: false,
        },
        {
          score: 0.62,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.6,
          expected: {
            floor: 0.6,
            coverage: 0.625,
            risk: 0.2,
            false_abstention: 0.0,
            answer_precision: 0.8,
          },
        },
        {
          floor: 0.62,
          expected: {
            floor: 0.62,
            coverage: 0.5,
            risk: 0.25,
            false_abstention: 0.25,
            answer_precision: 0.75,
          },
        },
        {
          floor: 0.65,
          expected: {
            floor: 0.65,
            coverage: 0.375,
            risk: 0.0,
            false_abstention: 0.25,
            answer_precision: 1.0,
          },
        },
        {
          floor: 0.81,
          expected: {
            floor: 0.81,
            coverage: 0.0,
            risk: 0.0,
            false_abstention: 1.0,
            answer_precision: 0.0,
          },
        },
        {
          floor: 0.25,
          expected: {
            floor: 0.25,
            coverage: 1.0,
            risk: 0.5,
            false_abstention: 0.0,
            answer_precision: 0.5,
          },
        },
      ],
      curve: [
        {
          floor: 0.8,
          coverage: 0.125,
          risk: 0.0,
          false_abstention: 0.75,
          answer_precision: 1.0,
        },
        {
          floor: 0.7,
          coverage: 0.25,
          risk: 0.0,
          false_abstention: 0.5,
          answer_precision: 1.0,
        },
        {
          floor: 0.65,
          coverage: 0.375,
          risk: 0.0,
          false_abstention: 0.25,
          answer_precision: 1.0,
        },
        {
          floor: 0.62,
          coverage: 0.5,
          risk: 0.25,
          false_abstention: 0.25,
          answer_precision: 0.75,
        },
        {
          floor: 0.6,
          coverage: 0.625,
          risk: 0.2,
          false_abstention: 0.0,
          answer_precision: 0.8,
        },
        {
          floor: 0.55,
          coverage: 0.75,
          risk: 0.3333333333333333,
          false_abstention: 0.0,
          answer_precision: 0.6666666666666666,
        },
        {
          floor: 0.4,
          coverage: 0.875,
          risk: 0.42857142857142855,
          false_abstention: 0.0,
          answer_precision: 0.5714285714285714,
        },
        {
          floor: 0.3,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.18273809523809523,
      aurc_round4: 0.1827,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.6,
              coverage: 0.625,
              risk: 0.2,
              false_abstention: 0.0,
              answer_precision: 0.8,
            },
            target_precision: {
              floor: 0.65,
              coverage: 0.375,
              risk: 0.0,
              false_abstention: 0.25,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
        {
          requested_target: 1.0,
          expected: {
            zero_fa: {
              floor: 0.6,
              coverage: 0.625,
              risk: 0.2,
              false_abstention: 0.0,
              answer_precision: 0.8,
            },
            target_precision: {
              floor: 0.65,
              coverage: 0.375,
              risk: 0.0,
              false_abstention: 0.25,
              answer_precision: 1.0,
            },
            target: 1.0,
          },
        },
      ],
      paste: {
        value: 0.6,
        why: "NOT separable: max OOC 0.620 >= min in-corpus 0.600; zero-FA floor leaks 0.200",
      },
    },
    {
      name: "clean separable",
      points: [
        {
          score: 0.2,
          in_corpus: false,
        },
        {
          score: 0.7,
          in_corpus: true,
        },
        {
          score: 0.3,
          in_corpus: false,
        },
        {
          score: 0.75,
          in_corpus: true,
        },
        {
          score: 0.4,
          in_corpus: false,
        },
        {
          score: 0.8,
          in_corpus: true,
        },
      ],
      stats: [
        {
          floor: 0.55,
          expected: {
            floor: 0.55,
            coverage: 0.5,
            risk: 0.0,
            false_abstention: 0.0,
            answer_precision: 1.0,
          },
        },
        {
          floor: 0.4,
          expected: {
            floor: 0.4,
            coverage: 0.6666666666666666,
            risk: 0.25,
            false_abstention: 0.0,
            answer_precision: 0.75,
          },
        },
        {
          floor: 0.7,
          expected: {
            floor: 0.7,
            coverage: 0.5,
            risk: 0.0,
            false_abstention: 0.0,
            answer_precision: 1.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.8,
          coverage: 0.16666666666666666,
          risk: 0.0,
          false_abstention: 0.6666666666666666,
          answer_precision: 1.0,
        },
        {
          floor: 0.75,
          coverage: 0.3333333333333333,
          risk: 0.0,
          false_abstention: 0.3333333333333333,
          answer_precision: 1.0,
        },
        {
          floor: 0.7,
          coverage: 0.5,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        {
          floor: 0.4,
          coverage: 0.6666666666666666,
          risk: 0.25,
          false_abstention: 0.0,
          answer_precision: 0.75,
        },
        {
          floor: 0.3,
          coverage: 0.8333333333333334,
          risk: 0.4,
          false_abstention: 0.0,
          answer_precision: 0.6,
        },
        {
          floor: 0.2,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.15,
      aurc_round4: 0.15,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.7,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target_precision: {
              floor: 0.7,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
        {
          requested_target: 1.0,
          expected: {
            zero_fa: {
              floor: 0.7,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target_precision: {
              floor: 0.7,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target: 1.0,
          },
        },
      ],
      paste: {
        value: 0.55,
        why: "separable: max OOC 0.400 < min in-corpus 0.700; midpoint has margin both ways",
      },
    },
    {
      name: "empty ooc",
      points: [
        {
          score: 0.5,
          in_corpus: true,
        },
        {
          score: 0.6,
          in_corpus: true,
        },
        {
          score: 0.7,
          in_corpus: true,
        },
      ],
      stats: [
        {
          floor: 0.55,
          expected: {
            floor: 0.55,
            coverage: 0.6666666666666666,
            risk: 0.0,
            false_abstention: 0.3333333333333333,
            answer_precision: 1.0,
          },
        },
        {
          floor: 0.5,
          expected: {
            floor: 0.5,
            coverage: 1.0,
            risk: 0.0,
            false_abstention: 0.0,
            answer_precision: 1.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.7,
          coverage: 0.3333333333333333,
          risk: 0.0,
          false_abstention: 0.6666666666666666,
          answer_precision: 1.0,
        },
        {
          floor: 0.6,
          coverage: 0.6666666666666666,
          risk: 0.0,
          false_abstention: 0.3333333333333333,
          answer_precision: 1.0,
        },
        {
          floor: 0.5,
          coverage: 1.0,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
      ],
      aurc: 0.0,
      aurc_round4: 0.0,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.5,
              coverage: 1.0,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target_precision: {
              floor: 0.5,
              coverage: 1.0,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
      ],
      paste: null,
    },
    {
      name: "empty in-corpus",
      points: [
        {
          score: 0.3,
          in_corpus: false,
        },
        {
          score: 0.4,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.35,
          expected: {
            floor: 0.35,
            coverage: 0.5,
            risk: 1.0,
            false_abstention: 0.0,
            answer_precision: 0.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.4,
          coverage: 0.5,
          risk: 1.0,
          false_abstention: 0.0,
          answer_precision: 0.0,
        },
        {
          floor: 0.3,
          coverage: 1.0,
          risk: 1.0,
          false_abstention: 0.0,
          answer_precision: 0.0,
        },
      ],
      aurc: 0.75,
      aurc_round4: 0.75,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: null,
            target_precision: null,
            target: 0.95,
          },
        },
      ],
      paste: null,
    },
    {
      name: "all in-corpus below ooc",
      points: [
        {
          score: 0.2,
          in_corpus: true,
        },
        {
          score: 0.25,
          in_corpus: true,
        },
        {
          score: 0.6,
          in_corpus: false,
        },
        {
          score: 0.7,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.2,
          expected: {
            floor: 0.2,
            coverage: 1.0,
            risk: 0.5,
            false_abstention: 0.0,
            answer_precision: 0.5,
          },
        },
        {
          floor: 0.6,
          expected: {
            floor: 0.6,
            coverage: 0.5,
            risk: 1.0,
            false_abstention: 1.0,
            answer_precision: 0.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.7,
          coverage: 0.25,
          risk: 1.0,
          false_abstention: 1.0,
          answer_precision: 0.0,
        },
        {
          floor: 0.6,
          coverage: 0.5,
          risk: 1.0,
          false_abstention: 1.0,
          answer_precision: 0.0,
        },
        {
          floor: 0.25,
          coverage: 0.75,
          risk: 0.6666666666666666,
          false_abstention: 0.5,
          answer_precision: 0.3333333333333333,
        },
        {
          floor: 0.2,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.7291666666666666,
      aurc_round4: 0.7292,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.2,
              coverage: 1.0,
              risk: 0.5,
              false_abstention: 0.0,
              answer_precision: 0.5,
            },
            target_precision: null,
            target: 0.95,
          },
        },
      ],
      paste: {
        value: 0.2,
        why: "NOT separable: max OOC 0.700 >= min in-corpus 0.200; zero-FA floor leaks 0.500",
      },
    },
    {
      name: "tie at the boundary",
      points: [
        {
          score: 0.6,
          in_corpus: true,
        },
        {
          score: 0.75,
          in_corpus: true,
        },
        {
          score: 0.6,
          in_corpus: false,
        },
        {
          score: 0.4,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.6,
          expected: {
            floor: 0.6,
            coverage: 0.75,
            risk: 0.3333333333333333,
            false_abstention: 0.0,
            answer_precision: 0.6666666666666666,
          },
        },
        {
          floor: 0.75,
          expected: {
            floor: 0.75,
            coverage: 0.25,
            risk: 0.0,
            false_abstention: 0.5,
            answer_precision: 1.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.75,
          coverage: 0.25,
          risk: 0.0,
          false_abstention: 0.5,
          answer_precision: 1.0,
        },
        {
          floor: 0.6,
          coverage: 0.75,
          risk: 0.3333333333333333,
          false_abstention: 0.0,
          answer_precision: 0.6666666666666666,
        },
        {
          floor: 0.4,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.1875,
      aurc_round4: 0.1875,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.6,
              coverage: 0.75,
              risk: 0.3333333333333333,
              false_abstention: 0.0,
              answer_precision: 0.6666666666666666,
            },
            target_precision: {
              floor: 0.75,
              coverage: 0.25,
              risk: 0.0,
              false_abstention: 0.5,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
        {
          requested_target: 0.5,
          expected: {
            zero_fa: {
              floor: 0.6,
              coverage: 0.75,
              risk: 0.3333333333333333,
              false_abstention: 0.0,
              answer_precision: 0.6666666666666666,
            },
            target_precision: {
              floor: 0.4,
              coverage: 1.0,
              risk: 0.5,
              false_abstention: 0.0,
              answer_precision: 0.5,
            },
            target: 0.5,
          },
        },
      ],
      paste: {
        value: 0.6,
        why: "NOT separable: max OOC 0.600 >= min in-corpus 0.600; zero-FA floor leaks 0.333",
      },
    },
    {
      name: "narrow interval falls back to hi",
      points: [
        {
          score: 0.6636,
          in_corpus: true,
        },
        {
          score: 0.6634,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.6636,
          expected: {
            floor: 0.6636,
            coverage: 0.5,
            risk: 0.0,
            false_abstention: 0.0,
            answer_precision: 1.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.6636,
          coverage: 0.5,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        {
          floor: 0.6634,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.125,
      aurc_round4: 0.125,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.6636,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target_precision: {
              floor: 0.6636,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
      ],
      paste: {
        value: 0.6636,
        why: "separable: max OOC 0.663 < min in-corpus 0.664; midpoint has margin both ways",
      },
    },
    {
      name: "half-even midpoint rounds down to even",
      points: [
        {
          score: 0.09375,
          in_corpus: true,
        },
        {
          score: 0.03125,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.062,
          expected: {
            floor: 0.062,
            coverage: 0.5,
            risk: 0.0,
            false_abstention: 0.0,
            answer_precision: 1.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.09375,
          coverage: 0.5,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        {
          floor: 0.03125,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.125,
      aurc_round4: 0.125,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.09375,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target_precision: {
              floor: 0.09375,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
      ],
      paste: {
        value: 0.062,
        why: "separable: max OOC 0.031 < min in-corpus 0.094; midpoint has margin both ways",
      },
    },
    {
      name: "half-even midpoint rounds up to even",
      points: [
        {
          score: 0.5,
          in_corpus: true,
        },
        {
          score: 0.375,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.438,
          expected: {
            floor: 0.438,
            coverage: 0.5,
            risk: 0.0,
            false_abstention: 0.0,
            answer_precision: 1.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.5,
          coverage: 0.5,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        {
          floor: 0.375,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.125,
      aurc_round4: 0.125,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.5,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target_precision: {
              floor: 0.5,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
      ],
      paste: {
        value: 0.438,
        why: "separable: max OOC 0.375 < min in-corpus 0.500; midpoint has margin both ways",
      },
    },
    {
      name: "duplicates across classes",
      points: [
        {
          score: 0.62,
          in_corpus: true,
        },
        {
          score: 0.55,
          in_corpus: true,
        },
        {
          score: 0.71,
          in_corpus: true,
        },
        {
          score: 0.55,
          in_corpus: true,
        },
        {
          score: 0.8,
          in_corpus: true,
        },
        {
          score: 0.44,
          in_corpus: true,
        },
        {
          score: 0.44,
          in_corpus: false,
        },
        {
          score: 0.71,
          in_corpus: false,
        },
        {
          score: 0.3,
          in_corpus: false,
        },
        {
          score: 0.52,
          in_corpus: false,
        },
        {
          score: 0.61,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.44,
          expected: {
            floor: 0.44,
            coverage: 0.9090909090909091,
            risk: 0.4,
            false_abstention: 0.0,
            answer_precision: 0.6,
          },
        },
        {
          floor: 0.55,
          expected: {
            floor: 0.55,
            coverage: 0.6363636363636364,
            risk: 0.2857142857142857,
            false_abstention: 0.16666666666666666,
            answer_precision: 0.7142857142857143,
          },
        },
        {
          floor: 0.71,
          expected: {
            floor: 0.71,
            coverage: 0.2727272727272727,
            risk: 0.3333333333333333,
            false_abstention: 0.6666666666666666,
            answer_precision: 0.6666666666666666,
          },
        },
        {
          floor: 0.62,
          expected: {
            floor: 0.62,
            coverage: 0.36363636363636365,
            risk: 0.25,
            false_abstention: 0.5,
            answer_precision: 0.75,
          },
        },
      ],
      curve: [
        {
          floor: 0.8,
          coverage: 0.09090909090909091,
          risk: 0.0,
          false_abstention: 0.8333333333333334,
          answer_precision: 1.0,
        },
        {
          floor: 0.71,
          coverage: 0.2727272727272727,
          risk: 0.3333333333333333,
          false_abstention: 0.6666666666666666,
          answer_precision: 0.6666666666666666,
        },
        {
          floor: 0.62,
          coverage: 0.36363636363636365,
          risk: 0.25,
          false_abstention: 0.5,
          answer_precision: 0.75,
        },
        {
          floor: 0.61,
          coverage: 0.45454545454545453,
          risk: 0.4,
          false_abstention: 0.5,
          answer_precision: 0.6,
        },
        {
          floor: 0.55,
          coverage: 0.6363636363636364,
          risk: 0.2857142857142857,
          false_abstention: 0.16666666666666666,
          answer_precision: 0.7142857142857143,
        },
        {
          floor: 0.52,
          coverage: 0.7272727272727273,
          risk: 0.375,
          false_abstention: 0.16666666666666666,
          answer_precision: 0.625,
        },
        {
          floor: 0.44,
          coverage: 0.9090909090909091,
          risk: 0.4,
          false_abstention: 0.0,
          answer_precision: 0.6,
        },
        {
          floor: 0.3,
          coverage: 1.0,
          risk: 0.45454545454545453,
          false_abstention: 0.0,
          answer_precision: 0.5454545454545454,
        },
      ],
      aurc: 0.28803128689492324,
      aurc_round4: 0.288,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.44,
              coverage: 0.9090909090909091,
              risk: 0.4,
              false_abstention: 0.0,
              answer_precision: 0.6,
            },
            target_precision: {
              floor: 0.8,
              coverage: 0.09090909090909091,
              risk: 0.0,
              false_abstention: 0.8333333333333334,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
        {
          requested_target: 0.8,
          expected: {
            zero_fa: {
              floor: 0.44,
              coverage: 0.9090909090909091,
              risk: 0.4,
              false_abstention: 0.0,
              answer_precision: 0.6,
            },
            target_precision: {
              floor: 0.8,
              coverage: 0.09090909090909091,
              risk: 0.0,
              false_abstention: 0.8333333333333334,
              answer_precision: 1.0,
            },
            target: 0.8,
          },
        },
        {
          requested_target: 1.0,
          expected: {
            zero_fa: {
              floor: 0.44,
              coverage: 0.9090909090909091,
              risk: 0.4,
              false_abstention: 0.0,
              answer_precision: 0.6,
            },
            target_precision: {
              floor: 0.8,
              coverage: 0.09090909090909091,
              risk: 0.0,
              false_abstention: 0.8333333333333334,
              answer_precision: 1.0,
            },
            target: 1.0,
          },
        },
      ],
      paste: {
        value: 0.44,
        why: "NOT separable: max OOC 0.710 >= min in-corpus 0.440; zero-FA floor leaks 0.400",
      },
    },
    {
      name: "single point each side",
      points: [
        {
          score: 0.664,
          in_corpus: true,
        },
        {
          score: 0.61,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.664,
          expected: {
            floor: 0.664,
            coverage: 0.5,
            risk: 0.0,
            false_abstention: 0.0,
            answer_precision: 1.0,
          },
        },
        {
          floor: 0.61,
          expected: {
            floor: 0.61,
            coverage: 1.0,
            risk: 0.5,
            false_abstention: 0.0,
            answer_precision: 0.5,
          },
        },
      ],
      curve: [
        {
          floor: 0.664,
          coverage: 0.5,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        {
          floor: 0.61,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.125,
      aurc_round4: 0.125,
      recommend: [
        {
          requested_target: 0.95,
          expected: {
            zero_fa: {
              floor: 0.664,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target_precision: {
              floor: 0.664,
              coverage: 0.5,
              risk: 0.0,
              false_abstention: 0.0,
              answer_precision: 1.0,
            },
            target: 0.95,
          },
        },
      ],
      paste: {
        value: 0.637,
        why: "separable: max OOC 0.610 < min in-corpus 0.664; midpoint has margin both ways",
      },
    },
    {
      name: "unreachable precision reports none",
      points: [
        {
          score: 0.5,
          in_corpus: true,
        },
        {
          score: 0.9,
          in_corpus: false,
        },
      ],
      stats: [
        {
          floor: 0.5,
          expected: {
            floor: 0.5,
            coverage: 1.0,
            risk: 0.5,
            false_abstention: 0.0,
            answer_precision: 0.5,
          },
        },
        {
          floor: 0.9,
          expected: {
            floor: 0.9,
            coverage: 0.5,
            risk: 1.0,
            false_abstention: 1.0,
            answer_precision: 0.0,
          },
        },
      ],
      curve: [
        {
          floor: 0.9,
          coverage: 0.5,
          risk: 1.0,
          false_abstention: 1.0,
          answer_precision: 0.0,
        },
        {
          floor: 0.5,
          coverage: 1.0,
          risk: 0.5,
          false_abstention: 0.0,
          answer_precision: 0.5,
        },
      ],
      aurc: 0.625,
      aurc_round4: 0.625,
      recommend: [
        {
          requested_target: 0.99,
          expected: {
            zero_fa: {
              floor: 0.5,
              coverage: 1.0,
              risk: 0.5,
              false_abstention: 0.0,
              answer_precision: 0.5,
            },
            target_precision: null,
            target: 0.99,
          },
        },
      ],
      paste: {
        value: 0.5,
        why: "NOT separable: max OOC 0.900 >= min in-corpus 0.500; zero-FA floor leaks 0.500",
      },
    },
  ],
  paste_errors: [
    {
      name: "empty ooc",
      points: [
        {
          score: 0.5,
          in_corpus: true,
        },
        {
          score: 0.6,
          in_corpus: true,
        },
        {
          score: 0.7,
          in_corpus: true,
        },
      ],
      error: "paste_value needs both in-corpus and out-of-corpus scores",
    },
    {
      name: "empty in-corpus",
      points: [
        {
          score: 0.3,
          in_corpus: false,
        },
        {
          score: 0.4,
          in_corpus: false,
        },
      ],
      error: "paste_value needs both in-corpus and out-of-corpus scores",
    },
    {
      name: "no points at all",
      points: [],
      error: "paste_value needs both in-corpus and out-of-corpus scores",
    },
  ],
  report_cases: [
    {
      name: "synthesized door, served generation, alt floor present",
      detail: [
        {
          query: "how does the abstention gate decide",
          in_corpus: true,
          score: 0.71,
        },
        {
          query: "what pins a citation to a generation",
          in_corpus: true,
          score: 0.664,
        },
        {
          query: "how are chunks kept overlap-free",
          in_corpus: true,
          score: 0.69,
        },
        {
          query: "what does the build lock record",
          in_corpus: true,
          score: 0.73,
        },
        {
          query: "how is the corpus version derived",
          in_corpus: true,
          score: 0.68,
        },
        {
          query: "who ratifies the calibrated floor",
          in_corpus: true,
          score: 0.75,
        },
        {
          query: "What's for dinner tonight?",
          in_corpus: false,
          score: 0.31,
        },
        {
          query: "How do I file my taxes?",
          in_corpus: false,
          score: 0.42,
        },
        {
          query: "What's the capital of Australia?",
          in_corpus: false,
          score: 0.55,
        },
        {
          query: "How long do I boil an egg?",
          in_corpus: false,
          score: 0.61,
        },
      ],
      meta: {
        generation: 3,
        pinned: false,
        model: "gemini-embedding-001",
        dim: 1536,
        door: "synthesized",
        oocSource: "built-in",
      },
      target_precision: 0.95,
      expected: {
        generation: 3,
        pinned: false,
        model: "gemini-embedding-001",
        dim: 1536,
        door: "synthesized",
        ooc_source: "built-in",
        in_corpus_queries: 6,
        ooc_probes: 4,
        aurc: 0.0926,
        zero_fa: {
          floor: 0.664,
          coverage: 0.6,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        target_precision: {
          floor: 0.664,
          coverage: 0.6,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        paste: 0.637,
        separable: true,
        target: 0.95,
        measured_at: "2026-08-21",
        paste_why: "separable: max OOC 0.610 < min in-corpus 0.664; midpoint has margin both ways",
        margin: 0.054,
        low_tail: [
          {
            query: "what pins a citation to a generation",
            in_corpus: true,
            score: 0.664,
          },
          {
            query: "how is the corpus version derived",
            in_corpus: true,
            score: 0.68,
          },
          {
            query: "how are chunks kept overlap-free",
            in_corpus: true,
            score: 0.69,
          },
          {
            query: "how does the abstention gate decide",
            in_corpus: true,
            score: 0.71,
          },
          {
            query: "what does the build lock record",
            in_corpus: true,
            score: 0.73,
          },
        ],
        detail: [
          {
            query: "how does the abstention gate decide",
            in_corpus: true,
            score: 0.71,
          },
          {
            query: "what pins a citation to a generation",
            in_corpus: true,
            score: 0.664,
          },
          {
            query: "how are chunks kept overlap-free",
            in_corpus: true,
            score: 0.69,
          },
          {
            query: "what does the build lock record",
            in_corpus: true,
            score: 0.73,
          },
          {
            query: "how is the corpus version derived",
            in_corpus: true,
            score: 0.68,
          },
          {
            query: "who ratifies the calibrated floor",
            in_corpus: true,
            score: 0.75,
          },
          {
            query: "What's for dinner tonight?",
            in_corpus: false,
            score: 0.31,
          },
          {
            query: "How do I file my taxes?",
            in_corpus: false,
            score: 0.42,
          },
          {
            query: "What's the capital of Australia?",
            in_corpus: false,
            score: 0.55,
          },
          {
            query: "How long do I boil an egg?",
            in_corpus: false,
            score: 0.61,
          },
        ],
      },
      rendered:
        "\nmeasured on generation 3 (served), model gemini-embedding-001, door: synthesized\nCAVEAT: synthesized queries are written FROM the passages they are then scored against, so they share vocabulary a reader's question will not. This door measures an UPPER BOUND on separation \u2014 treat the floor below as provisional until it has been checked against questions the corpus did not write (--queries-file), and re-run if real questions score under it.\nCAVEAT: the out-of-corpus probes are the BUILT-IN set, which is entirely far-domain \u2014 a shipped set cannot be scope-adjacent, because adjacency depends on a corpus it has never seen. Far-domain probes score low against anything, so this margin is an OVER-estimate and a floor it blesses may still answer near-misses just outside your scope. Re-run with --ooc-file naming questions a reader might plausibly ask that this record does NOT cover, and trust that verdict over this one.\nAURC = 0.0926  (lower = better separation)\nseparation margin: 0.054 (over 6 in-corpus / 4 out-of-corpus probes)\nzero-FA floor (never refuse a real question): 0.664 -> coverage 0.600, ooc leak 0.000\nALT (0.95-precision): floor = 0.664 -> coverage 0.600\nweakest in-corpus queries (these set the floor):\n  0.664  what pins a citation to a generation\n  0.680  how is the corpus version derived\n  0.690  how are chunks kept overlap-free\n  0.710  how does the abstention gate decide\n  0.730  what does the build lock record\n\nseparable: max OOC 0.610 < min in-corpus 0.664; midpoint has margin both ways\nPaste this into instance.md's frontmatter (merge it into `retrieval:` if the file already has one):\nretrieval:\n  vector_floor: 0.637   # calibrated 2026-08-21 on generation 3, model gemini-embedding-001/d1536, door: synthesized\n",
    },
    {
      name: "queries-file door, generation None, not separable, no alt floor",
      detail: [
        {
          query: "what is a governed corpus",
          in_corpus: true,
          score: 0.58,
        },
        {
          query: "how does serving fail safe",
          in_corpus: true,
          score: 0.72,
        },
        {
          query: "Best pizza place near me?",
          in_corpus: false,
          score: 0.62,
        },
        {
          query: "How do I reset my wifi router?",
          in_corpus: false,
          score: 0.33,
        },
      ],
      meta: {
        generation: null,
        pinned: false,
        model: "some-model@768",
        dim: 768,
        door: "queries-file",
        oocSource: "built-in",
      },
      target_precision: 0.95,
      expected: {
        generation: null,
        pinned: false,
        model: "some-model@768",
        dim: 768,
        door: "queries-file",
        ooc_source: "built-in",
        in_corpus_queries: 2,
        ooc_probes: 2,
        aurc: 0.2708,
        zero_fa: {
          floor: 0.58,
          coverage: 0.75,
          risk: 0.3333333333333333,
          false_abstention: 0.0,
          answer_precision: 0.6666666666666666,
        },
        target_precision: {
          floor: 0.72,
          coverage: 0.25,
          risk: 0.0,
          false_abstention: 0.5,
          answer_precision: 1.0,
        },
        paste: 0.58,
        separable: false,
        target: 0.95,
        measured_at: "2026-08-21",
        paste_why: "NOT separable: max OOC 0.620 >= min in-corpus 0.580; zero-FA floor leaks 0.333",
        margin: -0.04,
        low_tail: [
          {
            query: "what is a governed corpus",
            in_corpus: true,
            score: 0.58,
          },
          {
            query: "how does serving fail safe",
            in_corpus: true,
            score: 0.72,
          },
        ],
        detail: [
          {
            query: "what is a governed corpus",
            in_corpus: true,
            score: 0.58,
          },
          {
            query: "how does serving fail safe",
            in_corpus: true,
            score: 0.72,
          },
          {
            query: "Best pizza place near me?",
            in_corpus: false,
            score: 0.62,
          },
          {
            query: "How do I reset my wifi router?",
            in_corpus: false,
            score: 0.33,
          },
        ],
      },
      rendered:
        "\nmeasured on generation unknown (no generation pinned) (served), model some-model@768, door: queries-file\nCAVEAT: --queries-file floors are measured on human/gold-derived queries \u2014 section-weighted eval targets, NOT per-node passage samples \u2014 so this floor's low tail is a different distribution than the synthesized door's; record 'door: queries-file' beside the number and never compare the two doors' floors as interchangeable.\nCAVEAT: the out-of-corpus probes are the BUILT-IN set, which is entirely far-domain \u2014 a shipped set cannot be scope-adjacent, because adjacency depends on a corpus it has never seen. Far-domain probes score low against anything, so this margin is an OVER-estimate and a floor it blesses may still answer near-misses just outside your scope. Re-run with --ooc-file naming questions a reader might plausibly ask that this record does NOT cover, and trust that verdict over this one.\nAURC = 0.2708  (lower = better separation)\nseparation margin: -0.040 (over 2 in-corpus / 2 out-of-corpus probes)\nzero-FA floor (never refuse a real question): 0.580 -> coverage 0.750, ooc leak 0.333\nALT (0.95-precision): floor = 0.720 -> coverage 0.250\nweakest in-corpus queries (these set the floor):\n  0.580  what is a governed corpus\n  0.720  how does serving fail safe\n\nNOT separable: max OOC 0.620 >= min in-corpus 0.580; zero-FA floor leaks 0.333\nNOT pasting a floor: this measurement did not separate, so any number here would be one that is known to leak.\nWiden the probe set (scope-adjacent near-misses, not only far-domain questions), add in-corpus questions, and re-run. Until then, put the record in the fail-closed state — paste this into instance.md's frontmatter (merge it into `retrieval:` if the file already has one):\nretrieval:\n  vector_floor: uncalibrated\n",
    },
    {
      name: "pinned candidate generation, low tail truncates at five",
      detail: [
        {
          query: "q-weak-3",
          in_corpus: true,
          score: 0.641,
        },
        {
          query: "q-weak-1",
          in_corpus: true,
          score: 0.6,
        },
        {
          query: "q-strong-1",
          in_corpus: true,
          score: 0.82,
        },
        {
          query: "q-weak-2",
          in_corpus: true,
          score: 0.6,
        },
        {
          query: "q-weak-4",
          in_corpus: true,
          score: 0.65,
        },
        {
          query: "q-weak-5",
          in_corpus: true,
          score: 0.66,
        },
        {
          query: "q-strong-2",
          in_corpus: true,
          score: 0.9,
        },
        {
          query: "ooc-1",
          in_corpus: false,
          score: 0.2,
        },
        {
          query: "ooc-2",
          in_corpus: false,
          score: 0.35,
        },
      ],
      meta: {
        generation: 7,
        pinned: true,
        model: "gemini-embedding-001",
        dim: 1536,
        door: "synthesized",
        oocSource: "built-in",
      },
      target_precision: 1.0,
      expected: {
        generation: 7,
        pinned: true,
        model: "gemini-embedding-001",
        dim: 1536,
        door: "synthesized",
        ooc_source: "built-in",
        in_corpus_queries: 7,
        ooc_probes: 2,
        aurc: 0.0262,
        zero_fa: {
          floor: 0.6,
          coverage: 0.7777777777777778,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        target_precision: {
          floor: 0.6,
          coverage: 0.7777777777777778,
          risk: 0.0,
          false_abstention: 0.0,
          answer_precision: 1.0,
        },
        paste: 0.475,
        separable: true,
        target: 1,
        measured_at: "2026-08-21",
        paste_why: "separable: max OOC 0.350 < min in-corpus 0.600; midpoint has margin both ways",
        margin: 0.25,
        low_tail: [
          {
            query: "q-weak-1",
            in_corpus: true,
            score: 0.6,
          },
          {
            query: "q-weak-2",
            in_corpus: true,
            score: 0.6,
          },
          {
            query: "q-weak-3",
            in_corpus: true,
            score: 0.641,
          },
          {
            query: "q-weak-4",
            in_corpus: true,
            score: 0.65,
          },
          {
            query: "q-weak-5",
            in_corpus: true,
            score: 0.66,
          },
        ],
        detail: [
          {
            query: "q-weak-3",
            in_corpus: true,
            score: 0.641,
          },
          {
            query: "q-weak-1",
            in_corpus: true,
            score: 0.6,
          },
          {
            query: "q-strong-1",
            in_corpus: true,
            score: 0.82,
          },
          {
            query: "q-weak-2",
            in_corpus: true,
            score: 0.6,
          },
          {
            query: "q-weak-4",
            in_corpus: true,
            score: 0.65,
          },
          {
            query: "q-weak-5",
            in_corpus: true,
            score: 0.66,
          },
          {
            query: "q-strong-2",
            in_corpus: true,
            score: 0.9,
          },
          {
            query: "ooc-1",
            in_corpus: false,
            score: 0.2,
          },
          {
            query: "ooc-2",
            in_corpus: false,
            score: 0.35,
          },
        ],
      },
      rendered:
        "\nmeasured on generation 7 (PINNED), model gemini-embedding-001, door: synthesized\nCAVEAT: synthesized queries are written FROM the passages they are then scored against, so they share vocabulary a reader's question will not. This door measures an UPPER BOUND on separation \u2014 treat the floor below as provisional until it has been checked against questions the corpus did not write (--queries-file), and re-run if real questions score under it.\nCAVEAT: the out-of-corpus probes are the BUILT-IN set, which is entirely far-domain \u2014 a shipped set cannot be scope-adjacent, because adjacency depends on a corpus it has never seen. Far-domain probes score low against anything, so this margin is an OVER-estimate and a floor it blesses may still answer near-misses just outside your scope. Re-run with --ooc-file naming questions a reader might plausibly ask that this record does NOT cover, and trust that verdict over this one.\nAURC = 0.0262  (lower = better separation)\nseparation margin: 0.250 (over 7 in-corpus / 2 out-of-corpus probes)\nzero-FA floor (never refuse a real question): 0.600 -> coverage 0.778, ooc leak 0.000\nALT (1.0-precision): floor = 0.600 -> coverage 0.778\nweakest in-corpus queries (these set the floor):\n  0.600  q-weak-1\n  0.600  q-weak-2\n  0.641  q-weak-3\n  0.650  q-weak-4\n  0.660  q-weak-5\n\nseparable: max OOC 0.350 < min in-corpus 0.600; midpoint has margin both ways\nPaste this into instance.md's frontmatter (merge it into `retrieval:` if the file already has one):\nretrieval:\n  vector_floor: 0.475   # calibrated 2026-08-21 on generation 7, model gemini-embedding-001/d1536, door: synthesized\n",
    },
  ],
  format_cases: [
    {
      value: 0.0625,
      round3: 0.062,
      round4: 0.0625,
      fixed3: "0.062",
      repr: "0.0625",
    },
    {
      value: 0.4375,
      round3: 0.438,
      round4: 0.4375,
      fixed3: "0.438",
      repr: "0.4375",
    },
    {
      value: 0.6635,
      round3: 0.663,
      round4: 0.6635,
      fixed3: "0.663",
      repr: "0.6635",
    },
    {
      value: 0.615,
      round3: 0.615,
      round4: 0.615,
      fixed3: "0.615",
      repr: "0.615",
    },
    {
      value: 2.675,
      round3: 2.675,
      round4: 2.675,
      fixed3: "2.675",
      repr: "2.675",
    },
    {
      value: 0.30000000000000004,
      round3: 0.3,
      round4: 0.3,
      fixed3: "0.300",
      repr: "0.30000000000000004",
    },
    {
      value: 0.664,
      round3: 0.664,
      round4: 0.664,
      fixed3: "0.664",
      repr: "0.664",
    },
    {
      value: 0.9995,
      round3: 1.0,
      round4: 0.9995,
      fixed3: "1.000",
      repr: "0.9995",
    },
    {
      value: 0.5915,
      round3: 0.592,
      round4: 0.5915,
      fixed3: "0.592",
      repr: "0.5915",
    },
    {
      value: 0.0001,
      round3: 0.0,
      round4: 0.0001,
      fixed3: "0.000",
      repr: "0.0001",
    },
    {
      value: 0.95,
      round3: 0.95,
      round4: 0.95,
      fixed3: "0.950",
      repr: "0.95",
    },
    {
      value: 1.0,
      round3: 1.0,
      round4: 1.0,
      fixed3: "1.000",
      repr: "1.0",
    },
    {
      value: 0.0,
      round3: 0.0,
      round4: 0.0,
      fixed3: "0.000",
      repr: "0.0",
    },
    {
      value: 0.66649999999,
      round3: 0.666,
      round4: 0.6665,
      fixed3: "0.666",
      repr: "0.66649999999",
    },
    {
      value: 5e-5,
      round3: 0.0,
      round4: 0.0001,
      fixed3: "0.000",
      repr: "5e-05",
    },
    {
      value: 0.03125,
      round3: 0.031,
      round4: 0.0312,
      fixed3: "0.031",
      repr: "0.03125",
    },
    {
      value: 0.09375,
      round3: 0.094,
      round4: 0.0938,
      fixed3: "0.094",
      repr: "0.09375",
    },
    {
      value: 0.5005,
      round3: 0.5,
      round4: 0.5005,
      fixed3: "0.500",
      repr: "0.5005",
    },
    {
      value: 123.456789,
      round3: 123.457,
      round4: 123.4568,
      fixed3: "123.457",
      repr: "123.456789",
    },
    {
      value: 0.6634999999999999,
      round3: 0.663,
      round4: 0.6635,
      fixed3: "0.663",
      repr: "0.6634999999999999",
    },
  ],
  require_score_cases: [
    {
      query: "what is an agent",
      error: "query scored null (no vector results) — setup is broken: 'what is an agent'",
    },
    {
      query: "what's a corpus",
      error: 'query scored null (no vector results) — setup is broken: "what\'s a corpus"',
    },
    {
      query: 'say "hi" y\'all',
      error: "query scored null (no vector results) — setup is broken: 'say \"hi\" y\\'all'",
    },
  ],
};
