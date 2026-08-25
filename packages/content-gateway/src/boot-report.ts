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

/**
 * The column values start at, measured from the label — the two-space indent is
 * added on top. It must stay STRICTLY GREATER than the longest label the report
 * prints, which `boot-report.integration.test.ts` asserts against the real call
 * sites rather than against a list someone has to remember to update.
 */
export const VALUE_COLUMN: number = 10;

/**
 * A label that does not FIT the column still gets a space. `padEnd` returns the
 * label unchanged when it is already at or past the width, so a new
 * eleven-character label printed as `trust floorunverified` — one word,
 * unreadable, and green in every test because the alignment test only knew the
 * labels that existed (found live while adding the trust floor's own line).
 *
 * The fit is what the width has to be one wider than, not the overrun: a label
 * of EXACTLY the old width filled the field, took the separator branch anyway,
 * and started its value one column right of every shorter label — aligned in
 * the code's own terms and visibly crooked in the block (review finding 63).
 */
export function bootLine(label: string, text: string): string {
  const padded = label.padEnd(VALUE_COLUMN);
  return `  ${padded === label ? `${label} ` : padded}${text}`;
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
 * Who may ask, and — when nobody has to — WHAT THAT REACHES. `disabled` is not
 * a neutral fact; it is the posture an operator most needs to see, so it is
 * stated in capitals with the mitigation that makes it survivable (`buildAuth`
 * refuses a non-loopback bind without auth, so the only way to read the plain
 * DISABLED line is on a host that cannot be reached from outside).
 *
 * The viewer is an argument because the report carried both halves of this
 * state and never their product: `KSOR_AUTH=disabled-public` printed one
 * sentence and `KSOR_AUDIENCE=public,internal` printed another, so a door
 * handing the internal half of the record to anonymous callers read exactly
 * like one serving only the public half. Two green-looking lines (review
 * finding 61).
 *
 * REPORTED, not refused, which is the decision this comment exists to record.
 * Refusing would need a third variable to acknowledge the combination — and
 * that is the shape `AuthDisabled.publicAllowed` was written to avoid: two
 * variables that must agree to express one decision, plus a fourth combination
 * that means nothing. Refusing WITHOUT an acknowledgement is worse: it deletes
 * a documented capability from a private-network deployment that has no SSO,
 * which is governance as a gate rather than a ladder (product principle 7).
 * What was actually missing is that both facts were on the report and their
 * product was not — and that the sentence said "the whole record" whether or
 * not the whole record was being served, so the loud word had stopped meaning
 * anything by the time it was true. Reversed if this combination is ever
 * reachable WITHOUT the operator having named the restricted tier themselves —
 * that would make it an accident, and accidents fail closed here.
 */
export function authPosture(
  mode: "public" | "disabled",
  host: string,
  publicUnauthenticated: boolean,
  /** What this door will serve — `ctx.viewer`'s ask, not the fail-closed placeholder. */
  viewer: readonly string[],
): string {
  if (mode !== "disabled") {
    return "bearer tokens, verified against the record's authorization server";
  }
  // The escape hatch inverts the sentence, so the sentence has to know about it.
  // It previously said "a public bind will refuse to boot" whatever the bind
  // was — so the one configuration that serves the entire record to anyone who
  // can reach the port printed the reassurance meant for a loopback dev run.
  // The moment an operator most needs a loud line was the moment it lied.
  if (publicUnauthenticated) {
    const restricted = viewer.filter((tier) => tier !== "public");
    if (restricted.length > 0) {
      return (
        `UNAUTHENTICATED and bound to ${host} — KSOR_AUTH=disabled-public with ` +
        `KSOR_AUDIENCE=${viewer.join(",")}, so the RESTRICTED half of this record ` +
        `(${restricted.join(", ")}) is served to anyone who can reach this port`
      );
    }
    return (
      `UNAUTHENTICATED and bound to ${host} — KSOR_AUTH=disabled-public is set, so this ` +
      "record's public audience is served to anyone who can reach this port"
    );
  }
  return `DISABLED — ${host} only, and a public bind will refuse to boot`;
}

/**
 * Whether a generation pin will survive this deployment.
 *
 * Unset `KSOR_SNAPSHOT_KEYS` mints an EPHEMERAL per-process key. That is honest
 * for one process — the code that chose it said so — but a container is not one
 * process. On a scale-to-zero host every cold start mints a new key, so a
 * snapshot token issued by one instance is unverifiable by the next and `read`
 * silently drops to the ACTIVE generation, reporting `refreshed (invalid)`.
 *
 * Silently is the problem. It fails SOFT by design, so nothing errors and
 * nothing logs; the only symptom is an agent reading a generation it did not
 * search, which surfaces as roughly one read in three coming back unpinned.
 * Found exactly that way on a real deployment, which is why this line exists —
 * every other posture on this report announced itself and this one did not.
 *
 * Not a refusal: a loopback dev run and a genuine single-instance deployment
 * are both legitimate, and neither is harmed. So the line appears only where
 * the assumption actually stops holding — a public bind.
 */
export function snapshotPosture(activeKeyId: string, loopback: boolean): string | null {
  if (activeKeyId !== "ephemeral") return null;
  if (loopback) return null;
  return (
    "EPHEMERAL key — generation pins will NOT survive a restart or a second " +
    "instance; set KSOR_SNAPSHOT_KEYS to a value shared by every replica"
  );
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
