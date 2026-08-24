import defaultMdxComponents from "fumadocs-ui/mdx";

import { WrappableCodeBlock } from "@/components/code-block";
import { Embed } from "@/components/embed";
import { CodeBlockTabsTrigger } from "fumadocs-ui/components/codeblock";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import type { MDXComponents } from "mdx/types";
import type * as React from "react";

/**
 * A tab trigger that says WHICH tab it is, in an attribute we own.
 *
 * Radix already encodes the value in its generated `id`
 * (`radix-…-trigger-Claude Code`), and styling could key on that — but that is
 * a private format, so a change upstream would drop the branding silently and
 * nothing would go red. One attribute of our own costs a few lines and cannot
 * be taken away.
 *
 * `app/global.css` uses it to give a known tool its own colour; a tab value it
 * does not recognise simply renders in the site's own accent.
 */
function BrandedTabsTrigger({
  value,
  ...props
}: React.ComponentProps<typeof CodeBlockTabsTrigger>): React.ReactElement {
  return <CodeBlockTabsTrigger data-tab-value={value} value={value} {...props} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // The teaching-aid marker, rendering NOTHING unless a caller supplies a
    // deck. The rehype plugin inserts the marker into every document, and MDX
    // throws on a component it was not given — so the default has to exist
    // here or a document whose page forgot to pass one serves a 500 rather
    // than a page without an aid.
    TeachingAid: () => null,
    // A long line is the reader's to unwrap, per block — see
    // components/code-block.tsx. Replaces fumadocs' own `pre`.
    pre: WrappableCodeBlock,
    // `rehypeEmbeds` (source.config.ts) rewrites a link titled `embed` into
    // this; an unknown component fails the build, so it has to be in the map.
    Embed,
    // `remarkCodeTab` (source.config.ts) rewrites consecutive fenced blocks
    // that declare `tab="…"` into these, for the same reason.
    Tabs,
    Tab,
    CodeBlockTabsTrigger: BrandedTabsTrigger,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
