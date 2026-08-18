import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Static export: this route is prerendered into a JSON index file that the
// search dialog downloads and queries client-side (see app/layout.tsx).
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: "english",
});
