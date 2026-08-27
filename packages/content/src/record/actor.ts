/**
 * The actor convention (record spec §2.3): `human:<id>`, `process:<id>`,
 * `team:<id>`, or a producer/version pair. Trust tiers key on the `human:`
 * prefix, which is why a team is refused everywhere but ownership and the
 * policy: it would silently classify as machine-confirmed.
 */
export type ActorKind = "human" | "process" | "team" | "producer";

const PREFIXED = /^(human|process|team):(\S+)$/;
const PRODUCER = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export function actorKind(value: string): ActorKind | null {
  const m = PREFIXED.exec(value);
  if (m !== null) return m[1] as ActorKind;
  return PRODUCER.test(value) ? "producer" : null;
}

/** The forms allowed in `verified`, `generated`, `approval` and `deprecated`: everything but a team. */
export function isIndividualActor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const kind = actorKind(value);
  return kind !== null && kind !== "team";
}
