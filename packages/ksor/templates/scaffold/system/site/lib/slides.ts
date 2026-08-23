import { z } from "zod";

import { embedUrlFor, isHttpsUrl } from "./slides-embed";

/**
 * The shape of a `<doc>.slides.yaml` — a presentation that teaches this
 * document.
 *
 * The predecessor authors this INLINE in MDX: a `## 📚 Teaching Aid` heading,
 * a `:::tip` with the link, and a raw `<div style={{…}}>` wrapping an
 * `<iframe>` (`specs/crashcourses/connector-native-apps/…md`). None of that is
 * available here and the reason is critical rule 2: `knowledge/` is CommonMark
 * only, so a document cannot carry raw JSX and stay readable in a plain
 * markdown viewer. The deck is an attachment instead, which also means it
 * inherits the document's tier and takedown rather than being an embed nobody
 * governs.
 */
/**
 * One slide, as the record carries it.
 *
 * Deliberately NOT freeform markdown or HTML. A slide is a heading and a few
 * lines, and admitting arbitrary markup would put layout into the record —
 * which is the same mistake as embedding a deck, one level down. What a slide
 * says is knowledge; how it looks is the site's business.
 */
export const SlideSchema = z.object({
  heading: z.string().min(1).max(120),
  /**
   * Three to five in practice. The cap is six because a slide someone reads
   * aloud is a slide nobody listens to, and a limit is the only thing that
   * reliably stops a generator from pasting a paragraph per slide.
   */
  bullets: z.array(z.string().min(1).max(240)).max(6).optional(),
  /** One line under the heading, for a slide that makes a single point. */
  lead: z.string().max(300).optional(),
  /** Spoken, not shown. Rendered for the presenter, never on the slide. */
  note: z.string().max(600).optional(),
});

export const SlidesSchema = z
  .object({
    slides: z.object({
      title: z.string().min(1).max(120),
      /**
       * Where the deck lives. HTTPS only — an http:// embed is blocked as
       * mixed content on any deployed site, so accepting one would publish a
       * frame that silently never loads.
       */
      url: z.string().url().max(2000).optional(),
      /**
       * The provider's EMBED url, when it differs from the share url. Optional
       * because `embedUrlFor` derives it for providers whose rule is known;
       * required in practice for any provider whose is not, and a deck with
       * neither renders as a link rather than as a broken frame.
       */
      embed: z.string().url().max(2000).optional(),
      /** Shown beside the link — "Google Slides", "Canva". Never inferred. */
      provider: z.string().max(60).optional(),
      /** One line under the title, if the deck needs introducing. */
      description: z.string().max(300).optional(),
    }),
    /**
     * The slides themselves, when the record carries them.
     *
     * This is the mode that makes the workflow complete: an agent writes these
     * from the document with no browser and no third party, and the site
     * renders the presentation. The deck is then governed like everything else
     * here — reviewed in a PR, versioned with its document, withdrawn with it —
     * and it cannot rot into a dead link, because there is no link.
     */
    deck: z.array(SlideSchema).min(1).max(60).optional(),
  })
  .superRefine((value, ctx) => {
    // Exactly one source. A deck that is BOTH authored here and embedded from
    // elsewhere has two versions and no answer to which one governs — which is
    // the disagreement this whole product exists to settle.
    const authored = (value.deck?.length ?? 0) > 0;
    const linked = value.slides.url !== undefined;
    if (!authored && !linked) {
      ctx.addIssue({
        code: "custom",
        path: ["deck"],
        message:
          "ksor-slides-empty: a presentation needs either `deck:` (slides the record carries) or `slides.url:` (a deck hosted elsewhere) — with neither there is nothing to show",
      });
    }
    if (authored && linked) {
      ctx.addIssue({
        code: "custom",
        path: ["deck"],
        message:
          "ksor-slides-two-sources: this declares both `deck:` and `slides.url:`, so there are two presentations and nothing says which one governs — keep the one the record owns, or drop `deck:` and keep the link",
      });
    }

    for (const key of ["url", "embed"] as const) {
      const candidate = value.slides[key];
      if (candidate !== undefined && !isHttpsUrl(candidate)) {
        ctx.addIssue({
          code: "custom",
          path: ["slides", key],
          message: `ksor-slides-insecure: ${key} must be https:// — a browser blocks an http:// frame on a secure page as mixed content, so this would publish a deck that silently never loads`,
        });
      }
    }
    // A deck nobody can embed is still a legitimate deck — it renders as a
    // link. But a deck we cannot embed AND whose provider we cannot name is
    // worth telling the author about, because they probably expected a frame.
    if (
      linked &&
      value.slides.embed === undefined &&
      embedUrlFor(value.slides.url ?? "") === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["slides", "embed"],
        message: `ksor-slides-no-embed: this url has no embed form ksor knows how to derive, so the deck would render as a link only — add an explicit \`embed:\` url if you want it shown inline`,
      });
    }
  });

export type Slides = z.infer<typeof SlidesSchema>;
export type Slide = z.infer<typeof SlideSchema>;
