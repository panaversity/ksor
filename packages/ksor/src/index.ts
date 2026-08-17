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

/** The CLI vocabulary. Deliberately small; see the README. */
export const verbs = ["init", "dev", "build", "serve"] as const;

export type Verb = (typeof verbs)[number];

export interface ResolvedCommand {
  /** The recognized verb, or null when the first argument is not one. */
  readonly verb: Verb | null;
  /** Always false until a verb ships; the CLI reports honestly and exits 2. */
  readonly implemented: false;
}

/** Resolve the verb from CLI arguments (flags are skipped, never verbs). */
export function resolveCommand(argv: readonly string[]): ResolvedCommand {
  const first = argv.find((arg) => !arg.startsWith("-")) ?? null;
  const verb =
    first !== null && (verbs as readonly string[]).includes(first) ? (first as Verb) : null;
  return { verb, implemented: false };
}
