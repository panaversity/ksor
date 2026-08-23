import defaultMdxComponents from "fumadocs-ui/mdx";
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
    // `remarkCodeTab` (source.config.ts) rewrites consecutive fenced blocks
    // that declare `tab="…"` into these, so they have to be in the map or the
    // build fails on an unknown component rather than at authoring time.
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
