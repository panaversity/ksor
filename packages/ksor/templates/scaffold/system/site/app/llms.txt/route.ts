import { recordIndexText } from "@/lib/source";

export const revalidate = false;

// The agent-facing index of the record: this instance's name, then every
// document in sidebar order, each link usable as-is on a sub-path host — and
// each carrying its governance when the governance is a caveat.
//
// Without that last part a withdrawn document and the one that replaced it are
// two adjacent entries told apart only by whatever a human happened to type
// into a title, and an agent picks either (research/site-design.md F1).
//
// The bytes are built in lib/source (`recordIndexText`) because the home page
// shows this same index to a reader — one index, one spelling.
export function GET(): Response {
  return new Response(recordIndexText());
}
