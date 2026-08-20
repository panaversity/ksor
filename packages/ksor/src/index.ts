/**
 * Public entry point of @panaversity/ksor.
 *
 * Nothing here is a released capability: 0.x builds expose only the CLI
 * contract, so that scripts and agents driving `ksor` can rely on stable,
 * documented exit semantics before the verbs are implemented.
 */

/**
 * Exit-code contract for the `ksor` CLI. 2 must never be read as a crash: it
 * is the honest "this verb is designed but not implemented in this build".
 */
export const exitCodes = {
  /** The command was refused: bad input or a guarded operation. */
  refused: 1,
  /** The verb exists in the design but is not implemented in this build. */
  notImplemented: 2,
  /** The environment cannot run ksor (missing runtime requirement). */
  environment: 3,
} as const;

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes];

/** The CLI vocabulary. Lifecycle verbs plus the corpus operations the bundled
 * kernel provides (one binary — decision 12 publish revision). */
export const verbs = [
  "init",
  "dev",
  "build",
  "serve",
  "ingest",
  "schema",
  "grant",
  "calibrate",
  "gc",
] as const;

export type Verb = (typeof verbs)[number];

export interface ResolvedCommand {
  /** The first non-flag token, or null when only flags (or nothing) appear. */
  readonly word: string | null;
  /** `word` when it is in the vocabulary, otherwise null. */
  readonly verb: Verb | null;
}

/** Resolve the command word from CLI arguments (flags are skipped). */
export function resolveCommand(argv: readonly string[]): ResolvedCommand {
  const word = argv.find((arg) => !arg.startsWith("-")) ?? null;
  const verb = word !== null && (verbs as readonly string[]).includes(word) ? (word as Verb) : null;
  return { word, verb };
}
