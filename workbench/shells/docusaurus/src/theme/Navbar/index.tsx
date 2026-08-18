/**
 * Navbar — the site's top chrome, a full swizzle of Docusaurus's @theme/Navbar.
 *
 * Ported from the predecessor's sor-site shell (decision 6). What crossed: the
 * glass-on-scroll header, the 1800px measure, the mobile sheet with the doc
 * tree inside it, the search and color-mode mounts, and every SSR scar recorded
 * below. What did not: its custom SearchBar (this shell mounts the search
 * plugin's own `@theme/SearchBar`, so the index stays hashed and nothing
 * fetches it by a fixed path) and the lucide icon vocabulary (see ./items).
 *
 * It is not decoration. `doc-pages.css` sets the doc layout to an 1800px
 * measure; the stock Infima bar is full-bleed, so leaving it in place puts the
 * bar's contents and the page's contents on two different grids — the single
 * clearest tell that a theme was pasted on rather than built.
 *
 * CONTENT-DRIVEN. The title and mark come from @theme/Logo, i.e. from
 * `siteConfig.title` and `themeConfig.navbar.{title,logo}`; every link comes
 * from `themeConfig.navbar.items`. Nothing here names a project or a corpus.
 *
 * Class names are written out in full, never composed from a variable:
 * Tailwind scans source text for complete class strings, so `${bp}:flex` would
 * compile to nothing at all and fail silently at a viewport nobody tests.
 *
 * SSR discipline (found live in the predecessor): Node defines a global
 * `navigator`, so `typeof`-guards around platform state are dead code during
 * the server render. Everything here that depends on the browser — the scroll
 * state, the open sheet — starts at its SSR value and only changes after mount,
 * so the server HTML and the first client render agree.
 *
 * The desktop/mobile switch is `min-[997px]`, an arbitrary variant rather than
 * a named screen: Docusaurus swaps its own doc sidebar between mobile and
 * desktop at that pixel (theme-common useWindowSize — mobile is width <= 996),
 * so the hamburger appears exactly when the sidebar goes mobile.
 */

import { useLocation } from "@docusaurus/router";
import { useThemeConfig } from "@docusaurus/theme-common";
import { useNavbarMobileSidebar, useNavbarSecondaryMenu } from "@docusaurus/theme-common/internal";
import Logo from "@theme/Logo";
import SearchBar from "@theme/SearchBar";
import { type ReactElement, useEffect, useState } from "react";

import { CloseIcon, MenuIcon } from "../../components/icons";
import { ModeToggle } from "../../components/ModeToggle";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "../../components/ui/sheet";
import { cn } from "../../cn";
import { isRight, NavbarLinks, NavbarLinksMobile, type ThemeNavbarItem } from "./items";

export default function Navbar(): ReactElement {
  const { navbar } = useThemeConfig();
  const items = (navbar?.items ?? []) as ThemeNavbarItem[];
  const location = useLocation();
  const secondaryMenu = useNavbarSecondaryMenu();
  const mobileSidebar = useNavbarMobileSidebar();

  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The doc tree, teleported into the sheet by Docusaurus itself (theme-classic
  // DocSidebar/Mobile fills the secondary menu). Its presence IS the doc-page
  // signal at mobile width — no route regex to keep in step with routeBasePath.
  const docTree = secondaryMenu.content;

  // Glass intensity follows the scroll position. Read once on mount too: a page
  // opened at an anchor is already scrolled, and a listener-only version paints
  // such a page as if it were at the top.
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the sheet when the route actually changes (a link inside the doc tree
  // navigates without any of our own handlers running).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // This navbar renders its own sheet and never mounts Docusaurus's mobile
  // sidebar, so that sidebar's `shown` flag must stay false. It does not on its
  // own: the doc tree's item handler toggles it on every tap (theme-classic
  // DocSidebar/Mobile onItemClick), and while it reads true the navbar provider
  // registers a history blocker that swallows the reader's next Back press
  // (theme-common navbarMobileSidebar: `value.shown && <OnHistoryPop …>`).
  // Pinning it closed here keeps the browser's Back button honest.
  useEffect(() => {
    if (mobileSidebar.shown) {
      mobileSidebar.toggle();
    }
  }, [mobileSidebar.shown, mobileSidebar.toggle]);

  const leftItems = items.filter((item) => !isRight(item));
  const rightItems = items.filter(isRight);

  return (
    // The outer <nav> keeps Docusaurus's own classes so the framework's layout
    // math (sticky offset, print rules) still applies, with Infima's bar
    // painting reset to nothing: the <header> below is the bar.
    // `!z-40` is load-bearing, not decoration: Infima gives `.navbar--fixed-top`
    // z-index 200 (--ifm-z-index-fixed), which is above the sheet's portal at
    // z-50 — the bar then paints OVER the open sheet and eats its header row
    // (found live in the predecessor, at 375px, by looking at the sheet).
    <nav className="navbar navbar--fixed-top !z-40 !m-0 !block !h-auto !min-h-0 !border-none !bg-transparent !p-0 !shadow-none">
      <header
        className={cn(
          "sticky top-0 z-40 w-full border-b transition-all duration-300",
          isScrolled
            ? "border-border bg-background/95 shadow-sm backdrop-blur-xl"
            : "border-border/50 bg-background",
        )}
      >
        <div className="mx-auto flex h-[var(--ifm-navbar-height)] max-w-[1800px] items-center justify-between gap-2 px-4">
          {/* LEFT — brand, then the items configured for the left side */}
          <div className="flex shrink-0 items-center gap-3">
            {/* Colour lives on the anchor, not the title, so the whole brand
                (mark included) responds to one hover. `navbar__brand` is named
                alongside the utilities on purpose: it is the hook the
                sharp-corner exemption for the mark hangs off (src/css/custom.css). */}
            <Logo
              className="navbar__brand flex items-center gap-2 text-foreground transition-colors hover:text-primary hover:no-underline"
              imageClassName="flex items-center [&_img]:max-h-8 [&_img]:w-auto"
              titleClassName="navbar__title text-base font-bold tracking-tight sm:text-lg md:text-xl"
            />
            <NavbarLinks items={leftItems} className="hidden min-[997px]:flex" />
          </div>

          {/* CENTRE — deliberately empty. A wide search field in the middle of
              the bar reads as web-app chrome, not a publication's masthead.
              Search lives in the right cluster, one click away. */}
          <div className="hidden flex-1 min-[997px]:flex" />

          {/* RIGHT — configured right-side items, search, colour mode, menu */}
          <div className="flex shrink-0 items-center gap-1">
            <NavbarLinks items={rightItems} className="hidden min-[997px]:flex" />
            <div className="hidden min-[997px]:block">
              <SearchBar />
            </div>
            <div className="hidden min-[997px]:block">
              <ModeToggle />
            </div>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-foreground transition-colors hover:bg-accent min-[997px]:hidden"
                >
                  <MenuIcon className="size-5" />
                  <span className="sr-only">Open menu</span>
                </button>
              </SheetTrigger>
              {/* aria-describedby={undefined} is Radix's own opt-out: a dialog
                  with no description warns on every open otherwise, and this
                  one's content is a navigation menu that describes itself. */}
              <SheetContent
                aria-describedby={undefined}
                className="flex w-[300px] flex-col gap-0 overflow-hidden p-0 sm:w-[350px]"
              >
                <div className="flex h-12 shrink-0 flex-row items-center gap-1 border-b border-border pl-4 pr-2">
                  <SheetTitle className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
                    {docTree ? "Contents" : "Menu"}
                  </SheetTitle>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="-mr-1 inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-accent"
                    >
                      <CloseIcon className="size-4" />
                      <span className="sr-only">Close menu</span>
                    </button>
                  </SheetClose>
                </div>

                {/* Search first: on a record site it is the primary action. */}
                <div className="shrink-0 border-b border-border px-3 py-2">
                  <SearchBar />
                </div>

                <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1.5">
                  <ModeToggle />
                </div>

                {/* Navigation body. Both halves render when both exist — the
                    configured items, then the doc tree — so a reader never has
                    to go "back" to reach the other one.

                    The click handler closes the sheet on taps that actually
                    NAVIGATE. "Has an href" is not enough: a collapsible
                    category with no page of its own is rendered by Docusaurus
                    as <a href="#" role="button" aria-expanded> with no separate
                    caret button, so treating that "#" as navigation dismissed
                    the sheet on the very tap meant to expand the group — the
                    child pages became unreachable on phones while desktop,
                    which has no sheet, looked fine. (The predecessor's scar,
                    carried across with the code.) */}
                <div
                  className="flex-1 overflow-y-auto overscroll-contain p-2"
                  onClick={(e) => {
                    const link = (e.target as HTMLElement).closest("a");
                    if (!link) {
                      return;
                    }
                    const href = link.getAttribute("href");
                    const isPureToggle =
                      !href || href === "#" || link.getAttribute("role") === "button";
                    if (!isPureToggle) {
                      setMenuOpen(false);
                    }
                  }}
                >
                  <NavbarLinksMobile items={items} />
                  {docTree ? (
                    <div
                      className={items.length > 0 ? "mt-2 border-t border-border pt-2" : undefined}
                    >
                      {docTree}
                    </div>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </nav>
  );
}
