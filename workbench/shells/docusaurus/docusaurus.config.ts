/**
 * The Docusaurus conformance shell — the second implementation that keeps the
 * surface contract honest (specs/ksor/init/spec.md → the shell swap seam).
 *
 * Rebased on the predecessor's de-branded shell (`sor-site`, decision 6). What
 * crossed is machinery: the `future.v4` + `faster` build flags, the offline
 * search theme, and the config hygiene that keeps a built site free of
 * off-origin requests. What did not cross is product — the eight remark/lib
 * packages, mermaid, i18n, the blog, the og-image machinery — because a
 * directive grammar the record does not have would be a fork of the record,
 * not a feature of the shell. README.md records every rejection and its reason.
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

import { instanceName, llmsFull, llmsIndex, readRecord } from "./lib/record";

const shellDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(shellDir, "..", "..");
const knowledgeDir = path.join(repoRoot, "knowledge");

// Sub-path hosting knob — the same env var, with the same meaning, as the
// reference shell. Docusaurus wants a leading and trailing slash on baseUrl;
// text surfaces (llms.txt) get the bare prefix so links match the reference
// shell's byte-for-byte.
const ksorBasePath = process.env.KSOR_BASE_PATH ?? "";
const baseUrl = `${ksorBasePath}/`;

const name = instanceName(repoRoot);
const record = readRecord(knowledgeDir);

// llms.txt and llms-full.txt are generated at config load into a static dir:
// `docusaurus start` serves them and `docusaurus build` copies them into the
// export — one generation covers both surfaces. Regenerated per invocation,
// not per edit; the build is the surface of record.
const generatedDir = path.join(shellDir, ".generated");
fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(path.join(generatedDir, "llms.txt"), llmsIndex(name, record, ksorBasePath));
fs.writeFileSync(path.join(generatedDir, "llms-full.txt"), llmsFull(record, ksorBasePath));

// The `order:` governed key, translated: sort every generated sidebar level by
// the linked document's order (missing/non-numeric last), ties keeping the
// generator's own order. meta.json stays banned from the record.
type SidebarItem = { type?: string; id?: string; items?: SidebarItem[]; link?: { id?: string } };
const orderByDocId = new Map(
  record.map((doc) => [doc.file.replace(/\.md$/, ""), doc.order] as const),
);
function itemOrder(item: SidebarItem): number {
  const id =
    item.type === "doc" || item.type === undefined
      ? item.id
      : item.type === "category"
        ? item.link?.id
        : undefined;
  return (id !== undefined ? orderByDocId.get(id) : undefined) ?? Number.POSITIVE_INFINITY;
}
function sortItems(items: SidebarItem[]): SidebarItem[] {
  return items
    .map((item) => (item.items ? { ...item, items: sortItems(item.items) } : item))
    .sort((a, b) => {
      const left = itemOrder(a);
      const right = itemOrder(b);
      return left === right ? 0 : left < right ? -1 : 1;
    });
}

const config: Config = {
  title: name,
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
      title: name,
      logo: { alt: "KSoR", src: "img/ksor-mark.png" },
      items: [
        { type: "docSidebar", sidebarId: "defaultSidebar", label: "Knowledge", position: "left" },
      ],
    },
    footer: {
      style: "dark",
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
