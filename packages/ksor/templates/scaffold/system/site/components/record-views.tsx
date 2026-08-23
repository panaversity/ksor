"use client";

import { FileText, Layers, ListTree } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * The views of one document: the record's own words, its summary, its deck.
 *
 * PRESENCE-DRIVEN. With neither attachment there is no tab strip at all — not a
 * disabled tab, not a greyed affordance, not an empty panel. A control that
 * cannot do anything is worse than no control, and a governed record whose
 * documents mostly have no study attachments would otherwise grow a row of dead
 * chrome on every page.
 *
 * EVERY PANEL IS IN THE SERVER-RENDERED HTML, hidden rather than unmounted.
 * The panels arrive as props — React elements built on the server — so an agent
 * parsing the page, a crawler, and a reader whose bundle failed all get the
 * text. A summary that only exists once JavaScript runs is a summary missing
 * from the printout, which is the same argument governance.tsx makes for
 * rendering governance as plain markup.
 */

type ViewId = "document" | "summary" | "recall";

interface View {
  readonly id: ViewId;
  readonly label: string;
  readonly icon: ReactElement;
  readonly panel: ReactNode;
}

export interface RecordViewsProps {
  /** The document's own body — always present. */
  readonly children: ReactNode;
  /** Rendered summary, or null when the document has none. */
  readonly summary: ReactNode | null;
  /** The deck, or null when the document has none. */
  readonly recall: ReactNode | null;
}

const ICON = "size-3.5 shrink-0";

export function RecordViews({ children, summary, recall }: RecordViewsProps): ReactElement {
  const views: View[] = [
    { id: "document", label: "Document", icon: <FileText className={ICON} />, panel: children },
  ];
  if (summary !== null) {
    views.push({
      id: "summary",
      label: "Summary",
      icon: <ListTree className={ICON} />,
      panel: summary,
    });
  }
  if (recall !== null) {
    views.push({ id: "recall", label: "Recall", icon: <Layers className={ICON} />, panel: recall });
  }

  // No attachment, no chrome. Returned before any hook state matters — the
  // hooks below still run, because a conditional hook is a different bug.
  const only = views.length === 1;

  const [active, setActive] = useState<ViewId>("document");
  const tabRefs = useRef(new Map<ViewId, HTMLButtonElement>());
  const base = useId();
  const tabId = (id: ViewId): string => `${base}-tab-${id}`;
  const panelId = (id: ViewId): string => `${base}-panel-${id}`;

  /**
   * The view is in the URL fragment, so a summary is linkable and survives a
   * reload. Read on mount rather than during render: the server has no
   * fragment, and choosing a tab from it during render would hydrate a tree the
   * server never produced.
   */
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash === "summary" || fromHash === "recall") {
      setActive((current) =>
        views.some((v) => v.id === fromHash) ? (fromHash as ViewId) : current,
      );
    }
    // Views are derived from props that do not change for a given page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback((id: ViewId, focus = false) => {
    setActive(id);
    // replaceState, not a hash assignment: assigning location.hash scrolls the
    // matching element to the top of the viewport, which on a tab strip means
    // the page jumps every time a reader changes view.
    // pathname + search, not pathname alone: dropping back to the document
    // view must not silently discard a query string the reader arrived with.
    const base = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", id === "document" ? base : `${base}#${id}`);
    if (focus) tabRefs.current.get(id)?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = views.length - 1;
      const to =
        event.key === "ArrowRight"
          ? index === last
            ? 0
            : index + 1
          : event.key === "ArrowLeft"
            ? index === 0
              ? last
              : index - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : null;
      if (to === null) return;
      event.preventDefault();
      const target = views[to];
      if (target !== undefined) select(target.id, true);
    },
    [select, views],
  );

  if (only) return <>{children}</>;

  return (
    <div className="ksor-views">
      <div
        role="tablist"
        aria-label="Views of this document"
        // A rule under the strip rather than a boxed tab group: the record's
        // furniture is hairlines (see the governance block and the TOC rail),
        // and a heavier container here would make the study aids look more
        // important than the document they describe.
        className="mb-6 flex gap-1 border-b border-fd-border"
      >
        {views.map((view, index) => {
          const selected = view.id === active;
          return (
            <button
              key={view.id}
              ref={(node) => {
                if (node) tabRefs.current.set(view.id, node);
              }}
              type="button"
              role="tab"
              id={tabId(view.id)}
              aria-selected={selected}
              aria-controls={panelId(view.id)}
              // Roving tabIndex: one stop for the whole strip, arrows move
              // within it. Every tab being a tab stop is the common mistake and
              // makes a keyboard reader walk the chrome before the prose.
              tabIndex={selected ? 0 : -1}
              onClick={() => select(view.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={[
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 font-mono text-xs tracking-wide transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-primary",
                selected
                  ? "border-fd-primary text-fd-foreground"
                  : "border-transparent text-fd-muted-foreground hover:text-fd-foreground",
              ].join(" ")}
            >
              {view.icon}
              {view.label}
            </button>
          );
        })}
      </div>

      {views.map((view) => (
        <div
          key={view.id}
          role="tabpanel"
          id={panelId(view.id)}
          aria-labelledby={tabId(view.id)}
          hidden={view.id !== active}
          // Not tabbable itself; its contents are. A tabpanel of prose with
          // tabIndex={0} adds a stop that announces the whole document.
        >
          {view.panel}
        </div>
      ))}
    </div>
  );
}
