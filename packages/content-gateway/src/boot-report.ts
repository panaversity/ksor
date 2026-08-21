/**
 * What `ksor serve` says while it comes up.
 *
 * The boot output is the first thing an adopter sees of the product, and it
 * had become a transcript of other people's warnings: the driver's multi-line
 * `SECURITY WARNING` about sslmode aliases, our own three-line restatement of
 * the same thing, and the MCP SDK's note about a `responseMode` WE chose. An
 * operator who did nothing wrong read four alarming paragraphs and one line of
 * fact.
 *
 * The rule this module encodes: a warning ksor can ACT on is acted on and
 * stated in one phrase (see `pinnedTlsDsn`); a warning about a decision ksor
 * already made is not the adopter's to read; and what remains is the record's
 * posture, aligned, in ksor's voice — because on a governance surface, "auth
 * disabled" and "abstain OFF" are the two lines that actually need to be seen.
 */

/** Two-space indent, label padded so the values line up under each other. */
const LABEL_WIDTH = 9;

export function bootLine(label: string, text: string): string {
  return `  ${label.padEnd(LABEL_WIDTH)}${text}`;
}

export function bootHeader(corpusId: string): string {
  return `ksor serve · ${corpusId}`;
}

/**
 * Run `body` with ONE known-noisy warning suppressed by exact message.
 *
 * The MCP SDK warns, on every `createMcpHandler`, that `responseMode: "json"`
 * drops mid-call notifications. That is true and it is deliberate: this record
 * publishes no change notifications and emits nothing before a result, and the
 * stateless JSON shape is decision 13. Forwarding it to an adopter reports our
 * own recorded decision to them as a defect.
 *
 * Suppression is by EXACT message and scoped to the call — anything else the
 * SDK says, including a future different warning, still reaches the operator.
 * If upstream rewords this one, the filter stops matching and the warning
 * comes back, which is the correct failure direction.
 */
export const SDK_RESPONSE_MODE_WARNING: string =
  "responseMode: 'json' drops mid-call notifications. subscriptions/listen streams are always " +
  "served over SSE regardless; other notifications emitted before a result are dropped.";

export function withoutSdkResponseModeWarning<T>(body: () => T): T {
  const warn = console.warn;
  console.warn = (...args: unknown[]): void => {
    if (args.length === 1 && args[0] === SDK_RESPONSE_MODE_WARNING) return;
    warn(...args);
  };
  try {
    return body();
  } finally {
    console.warn = warn;
  }
}

/**
 * Who may ask. `disabled` is not a neutral fact — it is the posture an operator
 * most needs to see, so it is stated in capitals with the mitigation that makes
 * it survivable (`buildAuth` refuses a non-loopback bind without auth, so the
 * only way to read this line is on a host that cannot be reached from outside).
 */
export function authPosture(mode: "public" | "disabled", host: string): string {
  if (mode === "disabled") return `DISABLED — ${host} only, and a public bind will refuse to boot`;
  return "bearer tokens, verified against the record's authorization server";
}

/**
 * What the record will refuse. `null` means no floor is declared and the gate
 * is off — which is honest, and is a correct level-0 state, but an agent
 * pointed at this door will get a confident cited answer to a question the
 * corpus does not cover. Say that in the words an operator would use to decide,
 * not as a status code.
 */
export function abstainPosture(floor: number | "uncalibrated" | null): string {
  if (floor === null) {
    return "OFF — no floor calibrated; out-of-corpus questions will be answered, not refused";
  }
  if (floor === "uncalibrated") {
    return "REFUSING EVERYTHING — instance.md declares vector_floor: uncalibrated";
  }
  return `floor ${floor} — below it, this record abstains`;
}

/**
 * What the boot report says when instance.md is still the scaffold template.
 *
 * Not a scolding: a level-0 record is allowed to be undescribed and this is not
 * an error. It is stated because the instance.md body IS the agent surface's
 * system prompt, so leaving it unwritten is a decision with a runtime effect —
 * every agent is told this record's scope is unstated — and an operator should
 * learn that from the server rather than from an agent's answer.
 */
export const UNDESCRIBED_RECORD: string =
  "instance.md is still the scaffold template — agents are told this record's scope is " +
  "unstated; run the intake interview to describe it";
