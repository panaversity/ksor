/**
 * What to do when calibration is refused for quota — named, not left as the
 * vendor's sentence.
 *
 * Both of these were hit walking a real free-tier key, and they are DIFFERENT
 * failures with different remedies, which is why the raw error is not enough:
 *
 *   generate_content …/gemini-3.7-flash, limit 5   the SYNTHESIZED door writes
 *                                                  one probe question per
 *                                                  sampled passage, and a free
 *                                                  key allows a handful of
 *                                                  generations a minute. No
 *                                                  amount of waiting fixes a
 *                                                  corpus of any size; the
 *                                                  answer is the zero-LLM door.
 *   global_embed_content_requests_per_minute       the EMBEDDING endpoint, which
 *                                                  both doors use. Transient:
 *                                                  an ingest immediately before
 *                                                  a calibration spends the same
 *                                                  per-minute budget.
 *
 * Product principle 4: a failure states what is wrong, why the rule exists, and
 * how to fix it. The vendor's message states only the first.
 */

/** The generation quota, which no wait resolves on a free key. */
const GENERATION = /generate_content|generativelanguage\.googleapis\.com\/generate/i;
/** The embedding quota, which clears on its own. */
const EMBEDDING = /embed_content|global_embed/i;

/**
 * The remedy for a quota refusal, or null when the failure is not one this
 * knows — in which case the vendor's own message stands, unembellished.
 */
export function quotaRemedy(message: string): string | null {
  if (GENERATION.test(message)) {
    return (
      "the SYNTHESIZED door writes one probe question per sampled passage with an LLM, " +
      "and a free-tier key allows only a few generations a minute — a bigger corpus makes " +
      "this worse, not better.\n" +
      "  fix: calibrate with zero LLM — write your in-corpus questions one per line and pass\n" +
      "       --queries-file PATH. The floor is measured the same way; only the questions differ,\n" +
      "       and the door is recorded beside the number so the two are never compared."
    );
  }
  if (EMBEDDING.test(message)) {
    return (
      "the EMBEDDING endpoint is limited per minute, and both doors use it — an ingest " +
      "immediately before this spends the same budget.\n" +
      "  fix: wait about a minute and run it again. Nothing was written; calibration only reads."
    );
  }
  return null;
}
