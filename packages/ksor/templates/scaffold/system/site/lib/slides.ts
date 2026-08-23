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
export const SlidesSchema = z
  .object({
    slides: z.object({
      title: z.string().min(1).max(120),
      /**
       * Where the deck lives. HTTPS only — an http:// embed is blocked as
       * mixed content on any deployed site, so accepting one would publish a
       * frame that silently never loads.
       */
      url: z.string().url().max(2000),
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
  })
  .superRefine((value, ctx) => {
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
    if (value.slides.embed === undefined && embedUrlFor(value.slides.url) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["slides", "embed"],
        message: `ksor-slides-no-embed: this url has no embed form ksor knows how to derive, so the deck would render as a link only — add an explicit \`embed:\` url if you want it shown inline`,
      });
    }
  });

export type Slides = z.infer<typeof SlidesSchema>;
