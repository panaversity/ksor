/**
 * Footer — a full swizzle of Docusaurus's @theme/Footer.
 *
 * Ported from the predecessor's sor-site shell (decision 6). What crossed is
 * the LAYOUT GRAMMAR: the site's own name set large beside its link columns,
 * uppercase column headings in the muted tone, quiet links that come forward on
 * hover, a hairline above the closing line, and the same 1800px measure the bar
 * and the doc layout use.
 *
 * CONTENT-DRIVEN: everything rendered comes from `themeConfig.footer`
 * (`links`, `copyright`, `logo`) and `siteConfig.title`. Both of Docusaurus's
 * documented `links` shapes work — an array of `{title, items}` columns or a
 * flat array of link items — and link items render through Docusaurus's own
 * @theme/Footer/LinkItem, so `to`/`href`, base-url handling and the external
 * link glyph behave exactly as the framework documents. No `themeConfig.footer`,
 * no footer, matching stock.
 *
 * `footer.style` is not read. Infima's "dark" footer is a painted band; this
 * design system has one surface per theme, and a permanently dark strip under a
 * light page is the seam a pasted-on theme shows first.
 *
 * Palette: this file names no colour literal.
 *
 * found live in the predecessor: link colours have to be named here and cannot
 * be left to Infima's `.footer__link-item`, because this bar is not Infima's.
 */

import useBaseUrl from "@docusaurus/useBaseUrl";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import {
  isMultiColumnFooterLinks,
  ThemeClassNames,
  useThemeConfig,
} from "@docusaurus/theme-common";
import LinkItem from "@theme/Footer/LinkItem";
import ThemedImage from "@theme/ThemedImage";
import type { CSSProperties, ReactElement } from "react";

import { cn } from "../../cn";

interface FooterLink {
  label?: string;
  html?: string;
  className?: string;
  to?: string;
  href?: string;
  [key: string]: unknown;
}

interface FooterColumn {
  title?: string;
  className?: string;
  items: FooterLink[];
}

// Docusaurus's own discriminator for the two documented `links` shapes, given
// this file's types — one cast, stated once, instead of one at each use.
const isColumns = isMultiColumnFooterLinks as unknown as (
  links: (FooterLink | FooterColumn)[],
) => links is FooterColumn[];

interface FooterLogo {
  src: string;
  srcDark?: string;
  alt?: string;
  href?: string;
  width?: string | number;
  height?: string | number;
  target?: string;
  style?: CSSProperties;
}

/** One link row: an author-supplied html item, or a real Docusaurus link. */
function FooterLinkRow({ item }: { item: FooterLink }): ReactElement {
  if (item.html) {
    return (
      <li
        className={cn("text-sm", item.className)}
        // The config author provided the HTML, as stock Docusaurus does.
        dangerouslySetInnerHTML={{ __html: item.html }}
      />
    );
  }
  return (
    <li>
      <LinkItem
        item={{
          ...item,
          className: cn(
            // inline-flex, not Infima's inline: Docusaurus appends its own
            // external-link glyph after the label of an `href` item, and as an
            // inline link inside a narrow <li> that glyph dropped onto a second
            // line of its own (seen live 2026-08-18 on "Built with KSoR").
            "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline",
            item.className,
          ),
        }}
      />
    </li>
  );
}

function FooterColumns({ columns }: { columns: FooterColumn[] }): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-8 text-sm md:grid-cols-3 lg:grid-cols-4">
      {columns.map((column, i) => (
        <div
          key={i}
          className={cn(
            ThemeClassNames.layout.footer.column,
            "flex flex-col gap-2",
            column.className,
          )}
        >
          {column.title ? (
            <div className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
              {column.title}
            </div>
          ) : null}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {column.items.map((item, j) => (
              <FooterLinkRow key={j} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FooterRow({ links }: { links: FooterLink[] }): ReactElement {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-6 gap-y-2 p-0">
      {links.map((item, i) => (
        <FooterLinkRow key={i} item={item} />
      ))}
    </ul>
  );
}

function FooterLogoImage({ logo }: { logo: FooterLogo }): ReactElement {
  const sources = {
    light: useBaseUrl(logo.src),
    dark: useBaseUrl(logo.srcDark || logo.src),
  };
  const image = (
    <ThemedImage
      sources={sources}
      alt={logo.alt ?? ""}
      width={logo.width}
      height={logo.height}
      style={logo.style}
      className="max-h-10 w-auto"
    />
  );
  return logo.href ? (
    <a
      href={logo.href}
      target={logo.target ?? "_self"}
      rel={logo.target === "_blank" ? "noopener noreferrer" : undefined}
      className="inline-flex hover:no-underline"
    >
      {image}
    </a>
  ) : (
    image
  );
}

export default function Footer(): ReactElement | null {
  const { footer } = useThemeConfig();
  const { siteConfig } = useDocusaurusContext();
  // The audience watermark: present only on a build below the record's
  // least-restricted tier, so a screenshot of an internal page says what it
  // is. A whole string, composed in the config — this component never sees
  // the audience list, and a public build carries no such field at all.
  const audienceLabel = siteConfig.customFields?.audienceLabel as string | undefined;

  // Stock behaviour: no themeConfig.footer, no footer — but the watermark
  // outranks it. A build that must not be published says so even in a project
  // whose owner deleted their footer config.
  if (!footer && !audienceLabel) {
    return null;
  }

  const {
    copyright,
    links = [],
    logo,
  } = (footer ?? {}) as {
    copyright?: string;
    links?: (FooterLink | FooterColumn)[];
    logo?: FooterLogo;
  };
  const hasLinks = links.length > 0;
  const multiColumn = hasLinks && isColumns(links);

  return (
    <footer
      className={cn(
        ThemeClassNames.layout.footer.container,
        "border-t border-border/50 bg-background px-4 pb-8 pt-14 text-foreground md:px-8",
      )}
    >
      <div className="mx-auto max-w-[1800px]">
        {/* The twelve-column split is for a footer that HAS link columns. With
            a flat row — which is what this shell configures — it laid a lone
            name across five columns and left seven empty, a 214px band of
            nothing (found live in the predecessor). Columns get the grid; a
            row sits under the name. */}
        {!footer ? null : multiColumn ? (
          <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-12">
            <div className="flex flex-col gap-4 md:col-span-5">
              {logo ? <FooterLogoImage logo={logo} /> : null}
              <div className="text-2xl font-semibold tracking-tight">{siteConfig.title}</div>
            </div>
            <div className="md:col-span-1" />
            <div className="md:col-span-6">
              <FooterColumns columns={links as FooterColumn[]} />
            </div>
          </div>
        ) : (
          <div className="mb-8 flex flex-col gap-4">
            {logo ? <FooterLogoImage logo={logo} /> : null}
            <div className="text-xl font-semibold tracking-tight">{siteConfig.title}</div>
            {hasLinks ? <FooterRow links={links as FooterLink[]} /> : null}
          </div>
        )}

        {copyright || audienceLabel ? (
          <div
            className={cn(
              "flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row",
              // The hairline separates the closing line from the footer above
              // it; with no footer configured there is nothing to separate.
              footer ? "border-t border-border/40 pt-8" : undefined,
            )}
          >
            {copyright ? (
              <div
                className="footer__copyright"
                // The config author provided the HTML, as stock Docusaurus does.
                dangerouslySetInnerHTML={{ __html: copyright }}
              />
            ) : null}
            {audienceLabel ? (
              <div className="uppercase tracking-widest">{audienceLabel}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
