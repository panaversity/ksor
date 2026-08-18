/**
 * Navbar items — the content-driven half of the bar.
 *
 * Every link comes from `themeConfig.navbar.items` in docusaurus.config.ts;
 * this module decides only how an item LOOKS, never which items exist.
 * Rendering delegates to Docusaurus's own `@theme/NavbarItem`, so every
 * documented item shape keeps working exactly as the framework describes and as
 * an agent's training data expects: `{type: "doc", docId}`, `{type:
 * "docSidebar", sidebarId}`, `{type: "dropdown", items}`, `{to}`/`{href}`,
 * `html`, `position`, `className`, `activeBasePath`.
 *
 * The predecessor added one field to that vocabulary — `icon:`, resolved
 * against an allowlist of thirty-seven lucide names. It did not cross: it is a
 * config vocabulary of that shell's own invention, and the whole icon library
 * shipped to serve it. README.md records it.
 */

import NavbarItemImpl from "@theme/NavbarItem";
import type { ComponentType, ReactElement } from "react";

import { cn } from "../../cn";

/** A themeConfig navbar item. Shape-checked by Docusaurus, not here. */
export interface ThemeNavbarItem {
  type?: string;
  label?: string;
  position?: "left" | "right";
  className?: string;
  [key: string]: unknown;
}

// @theme/NavbarItem's published prop type is the union of the standard item
// shapes; this module passes the item through unchanged. One cast, stated once.
const NavbarItem = NavbarItemImpl as unknown as ComponentType<Record<string, unknown>>;

export function isRight(item: ThemeNavbarItem): boolean {
  return item.position === "right";
}

/**
 * One navbar item. `mobile` switches Docusaurus's own desktop/mobile item
 * rendering: desktop items are `navbar__item navbar__link`, mobile items are
 * `menu__link` inside an `<li>` — the same markup the doc tree uses inside the
 * sheet, so both halves of that sheet read as one menu.
 */
export function NavbarLink({
  item,
  mobile = false,
}: {
  item: ThemeNavbarItem;
  mobile?: boolean;
}): ReactElement {
  const { className, ...rest } = item;

  return (
    <NavbarItem
      {...rest}
      mobile={mobile}
      className={cn(
        // Mobile items carry layout only, no colours: in the sheet they sit
        // directly above the doc tree's own `menu__link` rows, and matching
        // those exactly is what makes the sheet read as one menu.
        //
        // Desktop items name their colours, and must. Infima's `.navbar__link`
        // rules are written for the stock bar; this bar is a <header> of its
        // own, so every interactive colour here is explicit and token-named.
        //
        // inline-flex, not Infima's block: Docusaurus appends its own
        // external-link glyph after the label of an `href` item, and as a block
        // link that glyph dropped onto a second line and made the bar 44px tall
        // for one item (found live in the predecessor).
        mobile
          ? "flex items-center text-sm font-medium"
          : "inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground hover:no-underline aria-[current=page]:text-primary",
        className,
      )}
    />
  );
}

/** The desktop row of items for one side of the bar. */
export function NavbarLinks({
  items,
  className,
}: {
  items: ThemeNavbarItem[];
  className?: string;
}): ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={cn("items-center gap-1", className)}>
      {items.map((item, i) => (
        <NavbarLink key={i} item={item} />
      ))}
    </div>
  );
}

/** The same items as a menu list, for the mobile sheet. */
export function NavbarLinksMobile({
  items,
  className,
}: {
  items: ThemeNavbarItem[];
  className?: string;
}): ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className={cn("menu__list", className)}>
      {items.map((item, i) => (
        <NavbarLink key={i} item={item} mobile />
      ))}
    </ul>
  );
}
