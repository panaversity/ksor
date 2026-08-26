import { recordIndexText } from "@/lib/source";

export const revalidate = false;

// The agent-facing index of the record: this instance's name, then every
// document a MACHINE surface may carry, in sidebar order, each link usable
// as-is on a sub-path host.
//
// There is no caveat marker any more, because there is nothing to mark: the
// §2.5 table admits only stable, effective, unexpired, undenied concepts here,
// so a draft, a deprecated document and one past its `stale_after` are not
// entries at all. That replaced marking with exclusion — the older worry was a
// withdrawn document and its replacement sitting adjacent, told apart only by
// whatever a human typed into a title (research/site-design.md F1), and an
// agent picking either.
//
// The set is decided ONCE, by staging, and read back here: the bytes are built
// in lib/source (`recordIndexText`) because the home page shows this same index
// to a reader — one index, one spelling.
export function GET(): Response {
  return new Response(recordIndexText());
}
