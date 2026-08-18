/**
 * The Docusaurus conformance shell — the second implementation that keeps the
 * surface contract honest (specs/ksor/init/spec.md → the shell swap seam).
 *
 * Rebased on the predecessor's de-branded shell (`sor-site`, decision 6). What
 * crossed is machinery and design: the `future.v4` + `faster` build flags, the
 * offline search theme, the config hygiene that keeps a built site free of
 * off-origin requests, and — under `src/` — that shell's whole four-file design
 * system, its self-hosted typefaces and the chrome swizzles that finish it.
 * What did not cross is product: the eight remark/lib packages, mermaid, i18n,
 * the blog, the og-image machinery, and every component that reads a
 * frontmatter key or plugin datum the record does not have. A directive grammar
 * the record has not ratified would be a fork of the record, not a feature of
 * the shell. README.md records every rejection and its reason.
 *
 * Conformance-lean, never feature parity: it satisfies clauses 1–4 and
 * translates the governed `order` key. Everything it publishes it derives from
 * the record itself (lib/record.ts), with no framework in between.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

import { instanceName, instanceTitle, llmsFull, llmsIndex, readRecord } from "./lib/record";

const shellDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(shellDir, "..", "..");
const knowledgeDir = path.join(repoRoot, "knowledge");

/**
 * Sub-path hosting knob — the same env var, with the same meaning, as the
 * reference shell. Docusaurus wants a leading AND trailing slash on `baseUrl`;
 * the text surfaces (llms.txt) take the bare prefix so their links match the
 * reference shell's byte-for-byte.
 *
 * Normalized and validated, because raw interpolation built a garbage site
 * where the reference shell refuses (confirmed live 2026-08-18): `/repo/`
 * became `baseUrl: "/repo//"`, `/` became `"//"` — a protocol-relative URL, so
 * every asset pointed at a host that does not exist — and `repo` became
 * `"repo/"`, a relative baseUrl. All three built successfully and published a
 * site nobody could load. A refusal costs one message; a green build of a dead
 * site costs a deploy.
 */
function readBasePath(): string {
  const raw = (process.env.KSOR_BASE_PATH ?? "").trim();
  if (raw === "") return "";
  // One env var, one meaning, BOTH shells: the reference shell's framework
  // refuses "/" and a trailing slash outright, so this shell refuses the
  // same shapes instead of normalizing them — a value that builds here and
  // fails there is a trap (review finding, 2026-08-18).
  if (raw === "/" || !raw.startsWith("/") || raw.endsWith("/")) {
    throw new Error(
      `KSOR_BASE_PATH must look like "/repo" — got ${JSON.stringify(raw)}.\n` +
        "It is the sub-path the site is hosted under, prefixed onto every " +
        "route, asset and llms.txt link, and both shells accept exactly the " +
        "same shapes: a leading slash, no trailing one.\n" +
        "Fix: drop the trailing slash, or unset it to host at the root.",
    );
  }
  return raw;
}

const ksorBasePath = readBasePath();
const baseUrl = `${ksorBasePath}/`;

const name = instanceName(repoRoot);
const title = instanceTitle(repoRoot);
const record = readRecord(knowledgeDir);

// llms.txt and llms-full.txt are generated at config load into a static dir:
// `docusaurus start` serves them and `docusaurus build` copies them into the
// export — one generation covers both surfaces. Regenerated per invocation,
// not per edit; the build is the surface of record.
//
// The directory is REPLACED, never written into. It is a derived surface, so
// anything in it that this config did not just write is not derived from the
// record — and `staticDirectories` copies the whole directory, so a stray file
// left there once ships into every export from then on (confirmed live
// 2026-08-18 with a planted file). Removing the directory first makes the
// generation total.
const generatedDir = path.join(shellDir, ".generated");
fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(path.join(generatedDir, "llms.txt"), llmsIndex(name, record, ksorBasePath));
fs.writeFileSync(path.join(generatedDir, "llms-full.txt"), llmsFull(record, ksorBasePath));

// The `order:` governed key, translated: sort every generated sidebar level
// by the linked document's order (missing/non-numeric last), ties on the
// document's url — the same tie-break llms.txt uses, so the sidebar and the
// agent index never disagree (review finding, 2026-08-18: the generator's
// own tie order sorts by source filename WITH extension, which diverges from
// url order on prefix-related names). meta.json stays banned from the record.
type SidebarItem = { type?: string; id?: string; items?: SidebarItem[]; link?: { id?: string } };
const orderByDocId = new Map(
  record.map((doc) => [doc.file.replace(/\.md$/, ""), doc.order] as const),
);
const urlByDocId = new Map(record.map((doc) => [doc.file.replace(/\.md$/, ""), doc.url] as const));
function itemDocId(item: SidebarItem): string | undefined {
  if (item.type === "doc" || item.type === undefined) return item.id;
  if (item.type === "category") return item.link?.id ?? item.items?.map(itemDocId).find(Boolean);
  return undefined;
}
function itemOrder(item: SidebarItem): number {
  const id = itemDocId(item);
  return (id !== undefined ? orderByDocId.get(id) : undefined) ?? Number.POSITIVE_INFINITY;
}
function itemUrl(item: SidebarItem): string {
  const id = itemDocId(item);
  return (id !== undefined ? urlByDocId.get(id) : undefined) ?? "";
}
function sortItems(items: SidebarItem[]): SidebarItem[] {
  return items
    .map((item) => (item.items ? { ...item, items: sortItems(item.items) } : item))
    .sort((a, b) => {
      const left = itemOrder(a);
      const right = itemOrder(b);
      if (left !== right) return left < right ? -1 : 1;
      const leftUrl = itemUrl(a);
      const rightUrl = itemUrl(b);
      return leftUrl < rightUrl ? -1 : leftUrl > rightUrl ? 1 : 0;
    });
}

const config: Config = {
  title: title,
  tagline: "The Knowledge System of Record for humans and AI agents.",
  // instance.md reserves site.url for the deployed address; until ksor build
  // wires it through, a placeholder keeps the static export host-relative.
  url: "https://example.com",
  baseUrl,
  favicon: "img/favicon.png",
  trailingSlash: true,
  onBrokenLinks: "throw",

  // The predecessor's build flags, and the reason they crossed first: rspack,
  // swc and lightningcss instead of webpack, babel and terser, plus SSG on
  // worker threads. `faster: true` takes the whole set rather than the
  // predecessor's five sub-flags — it enumerated them because its own webpack
  // plugins (a path alias, a postcss patch) could not move to rspack; this
  // shell registers no webpack of its own, so nothing holds the bundler back.
  // `v4: true` is a prerequisite for the worker-thread SSG, not decoration.
  future: { v4: true, faster: true },

  // .md is CommonMark, exactly as the record rules promise — only .mdx (which
  // the record bans) would be MDX. Literal braces and `a<b` stay literal.
  markdown: { format: "detect" },

  presets: [
    [
      "classic",
      {
        docs: {
          path: knowledgeDir,
          routeBasePath: "docs",
          // Identity derives from file path (AGENTS.md, product principle 3),
          // and Docusaurus's default number-prefix parser breaks that: it
          // strips a leading `01-` from the slug AND from the sidebar label, so
          // `knowledge/01-intro.md` published at `/docs/intro/` while the
          // record calls it `01-intro`. Every llms.txt link 404s, and a record
          // that also holds `intro.md` gets two documents fighting for one
          // route (confirmed live 2026-08-18). Ordering is the governed
          // `order:` key's job; a filename is a name.
          numberPrefixParser: false,
          sidebarItemsGenerator: async ({ defaultSidebarItemsGenerator, ...args }) => {
            const items = await defaultSidebarItemsGenerator(args);
            return sortItems(items as SidebarItem[]) as typeof items;
          },
          editUrl: undefined,
          showLastUpdateTime: false,
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      // Offline search, the predecessor's pin. It indexes at build time into
      // the export and is served from the same origin — the only search that
      // keeps the no-off-origin-request contract. The bare specifier, never
      // require.resolve(): Docusaurus serializes this array into the client
      // bundle, so a resolved path bakes the building machine's absolute
      // checkout path into every built site (the predecessor measured it).
      "@easyops-cn/docusaurus-search-local",
      {
        docsRouteBasePath: "/docs",
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        highlightSearchTermsOnTargetPage: true,
        // The record is written in whatever language its owner writes in, but
        // an index is tokenized per language and this default tokenizes
        // English. An adopter writing in another one adds it here — they own
        // system/site, so that is an edit, not a fork.
        language: ["en"],
      },
    ],
  ],

  plugins: [
    /* The one plugin this shell registers, and the reason the ported design
     * system survives the build at all.
     *
     * Docusaurus applies postcss-preset-env with an empty options object, which
     * leaves preset-env's `cascade-layers` polyfill ON: every `@layer` is
     * rewritten into `:not(#\#)` specificity hacks. Tailwind's preflight —
     * `*,::before,::after { margin: 0; padding: 0; border: 0 solid }` — then
     * reaches the browser at specificity (2,0,0), while CSS modules are not
     * boosted by that rewrite at all and stay at (0,1,0). Every padding, margin
     * and border a module declares loses, silently and everywhere.
     *
     * Found live by the predecessor on its deployed demo, then traced through
     * the shipped stylesheet to this plugin. Cascade layers are baseline across
     * every browser this site targets, so the polyfill buys nothing and costs
     * the entire design system. Turning it off restores the ordinary cascade:
     * preflight stays inside `@layer base` — where its `!important` rules are
     * also what beat Infima's rounding — and unlayered module rules win.
     */
    function noCascadeLayerPolyfill() {
      return {
        name: "ksor-no-cascade-layer-polyfill",
        configurePostCss(postCssOptions: { plugins: unknown[] }) {
          postCssOptions.plugins = postCssOptions.plugins.map((plugin) =>
            Array.isArray(plugin) &&
            typeof plugin[0] === "string" &&
            plugin[0].includes("postcss-preset-env")
              ? [
                  plugin[0],
                  {
                    ...(plugin[1] as Record<string, unknown>),
                    features: { "cascade-layers": false },
                  },
                ]
              : plugin,
          );
          return postCssOptions;
        },
      };
    },
  ],

  // First writer wins: Docusaurus turns this array into copy-webpack-plugin
  // patterns in order and that plugin defaults to `force: false`, so an
  // earlier directory's file is not overwritten by a later one (measured by
  // the predecessor on 3.10.2). The derived surfaces are listed first because
  // a record-derived llms.txt outranks any authored copy of the same name.
  staticDirectories: [".generated", "static"],

  customFields: {
    firstDocUrl: record[0]?.url ?? null,
  },

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    docs: { sidebar: { hideable: true } },
    navbar: {
      title: title,
      logo: { alt: "KSoR", src: "img/ksor-mark.png" },
      items: [
        { type: "docSidebar", sidebarId: "defaultSidebar", label: "Knowledge", position: "left" },
      ],
    },
    footer: {
      // No `style` key: the swizzled footer paints from the design system's own
      // surface tokens, and Infima's permanently-dark band under a light page
      // is the seam a pasted-on theme shows first.
      // One link, and no copyright line: the record is the adopter's, and this
      // shell has no standing to assert a claim over it on their behalf.
      links: [{ label: "Built with KSoR", href: "https://github.com/panaversity/ksor" }],
    },
    // Set explicitly: Docusaurus's default prism theme is dark in both color
    // modes, which the predecessor measured at roughly 1.3:1 on a light page.
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  } satisfies Preset.ThemeConfig,
};

export default config;
