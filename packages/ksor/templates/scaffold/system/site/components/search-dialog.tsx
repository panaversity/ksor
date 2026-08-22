"use client";

import { useDocsSearch } from "fumadocs-core/search/client";
// `staticClient`, not `oramaStaticClient`: 16.14.0 replaced the Orama engine
// with ZBSearch and renamed the export, keeping the old name as a deprecated
// alias. Riding an alias is borrowing time — the subpath and the options are
// unchanged, so the new name costs nothing today and does not have to be found
// again when the alias goes.
import { staticClient } from "fumadocs-core/search/client/orama-static";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogListItem,
  SearchDialogOverlay,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { useMemo } from "react";

/**
 * The search dialog, with a caveat status on the rows that have one.
 *
 * Search was the last place a withdrawn document and its replacement looked
 * identical — and worse than the others, because the result SNIPPET quotes the
 * withdrawn figure, so a reader can take the wrong number out of the results
 * without ever opening the page (research/site-design.md F3).
 *
 * Composed from the shell's own exported primitives rather than rebuilt: the
 * only difference from the default dialog is the `Item` renderer. The status
 * is NOT written into the search index — that would put a label inside the
 * record's own titles, which the site does not author. It travels as a map of
 * route → status, built on the server, and is applied at render time.
 */
export interface KsorSearchDialogProps extends SharedProps {
  /** Where the static index is served from. */
  api?: string;
}

/**
 * Route → caveat status, read from the JSON the document carries (see
 * app/layout.tsx). It arrives that way rather than as a prop because
 * RootProvider types its `options` against the SHIPPED dialog's props, and
 * casting that away would hide a real break the day those props move.
 */
function readStatuses(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const el = document.getElementById("ksor-statuses");
  if (el === null) return {};
  try {
    const parsed: unknown = JSON.parse(el.textContent ?? "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    // A record with no caveats, or a document that never carried the map:
    // every row then renders exactly as the shipped dialog renders it.
    return {};
  }
}

const trimSlash = (url: string): string =>
  url.length > 1 && url.endsWith("/") ? url.slice(0, -1) : url;

export default function KsorSearchDialog({ api, ...props }: KsorSearchDialogProps) {
  const client = staticClient({ from: api });
  const { search, setSearch, query } = useDocsSearch({ client });
  const byUrl = useMemo(() => {
    const map = new Map<string, string>();
    for (const [url, status] of Object.entries(readStatuses())) map.set(trimSlash(url), status);
    return map;
  }, []);

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList
          items={query.data !== "empty" ? query.data : null}
          Item={(itemProps) => {
            // Only a page row carries a document's status; a heading or a text
            // fragment is part of one, and marking every fragment would be the
            // noise the page's own chip rule exists to avoid.
            const status =
              itemProps.item.type === "page" ? byUrl.get(trimSlash(itemProps.item.url)) : undefined;
            // The chip rides a data attribute rather than replacing the row's
            // children: the shell renders result text through its own markdown
            // renderer to turn the search highlights into <mark>, and children
            // passed here REPLACE that — which published the literal string
            // "Purchase approval <mark>thresholds</mark> (2019)" into the
            // dialog (seen in Chromium, 2026-08-21). CSS appends the label in
            // app/global.css.
            return (
              <SearchDialogListItem
                {...itemProps}
                {...(status === undefined ? {} : { "data-ksor-status": status })}
              />
            );
          }}
        />
      </SearchDialogContent>
    </SearchDialog>
  );
}
