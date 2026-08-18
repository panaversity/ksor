/**
 * The home page.
 *
 * Same content contract as the reference shell's home — the instance name, a
 * call to action derived from the first document in reading order or an honest
 * empty-record line, and the mark — set in the ported design system's own
 * display treatment (src/pages/index.module.css records the geometry, and
 * ../css/tokens.css the type and colour).
 *
 * The predecessor's `@theme/Landing` did not cross: four bands of framework
 * prose, a corpus manifest and a closing call are content, and the contract
 * this page answers to names four things. What crossed is the CRAFT — the
 * inset band with its hairline, the uppercase display type with the last word
 * of a multi-word name dropped into the primary, the dot field and blurred
 * spotlight behind it, the sharp-cornered action, the staggered entrance.
 */

import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import type { CSSProperties, ReactNode } from "react";

import { ArrowRightIcon } from "../components/icons";
import styles from "./index.module.css";

/** The stagger position, as data — see `.rise` in index.module.css. */
function step(index: number): CSSProperties {
  return { "--step": index } as CSSProperties;
}

/**
 * The two lines of the display treatment, and where the brand colour lands.
 *
 * The rule, ported with the type: the accent marks the last word of a
 * MULTI-word name; a one-word name is set whole, in the foreground. A 72px name
 * entirely in the accent reads as a link rather than a wordmark, and it puts
 * the two loudest things on the page — the name and the action under it — in
 * one colour. Splitting a single word to manufacture a tail was rejected there
 * and is rejected here: hyphenating somebody's project is not ours to do.
 */
function splitTitle(title: string): { lead?: string; last: string; accent: boolean } {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return { last: title.trim(), accent: false };
  }
  return {
    lead: words.slice(0, -1).join(" "),
    last: words[words.length - 1] ?? "",
    accent: true,
  };
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const firstDocUrl = siteConfig.customFields?.firstDocUrl as string | null;
  const { lead, last, accent } = splitTitle(siteConfig.title);

  return (
    <Layout>
      <main className={styles.page}>
        <header
          className={`${styles.heroFrame} overflow-hidden border-b border-border/40 bg-background`}
        >
          <div className={styles.dotField} aria-hidden="true" />
          <div className={styles.spotlight} aria-hidden="true" />
          <div className="relative z-10 mx-auto w-full max-w-[1800px]">
            <div
              className={`${styles.heroGrid} flex flex-col justify-center px-6 md:px-12 lg:px-16`}
            >
              {/* useBaseUrl, not a bare path: under KSOR_BASE_PATH the mark
                  lives at /<base>/img/ — a bare src 404s on every sub-path
                  deploy. `ksor-mark` is the sharp-corner exemption (see
                  ../css/custom.css): the mark is an opaque PNG, so a square one
                  lands as a white tile in dark mode. */}
              <img
                className={`${styles.rise} ksor-mark mb-8`}
                src={useBaseUrl("/img/ksor-mark.png")}
                alt=""
                width={64}
                height={64}
              />

              {/* The frame is KSoR's; the name is the record's. The eyebrow
                  brands the framework so the headline stays the adopter's. */}
              <p
                className={`${styles.rise} m-0 mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground`}
                style={step(1)}
              >
                KSoR — Knowledge System of Record
              </p>

              {/* The authored case, restored for assistive technology: the
                  capitals are a CSS text-transform, but an accessible name is
                  computed from RENDERED text, so without this a screen reader
                  announces an owner's project in a case they did not choose
                  (measured in the predecessor). */}
              <h1
                aria-label={siteConfig.title}
                className={`${styles.rise} mb-8 mt-0 text-balance text-4xl font-black uppercase leading-none tracking-tighter text-foreground sm:text-5xl md:text-6xl lg:text-7xl`}
                style={step(1)}
              >
                {lead ? <span className="block">{lead}</span> : null}
                {/* `tracking-tight`, not the heading's `tracking-tighter`: the
                    accented line is loosened deliberately — at 72px that is
                    1.8px of letter spacing rather than 3.6px on the single most
                    prominent word on the page. */}
                <span className={accent ? "mt-1 block tracking-tight text-primary" : "block"}>
                  {last}
                </span>
              </h1>

              <p
                className={`${styles.rise} m-0 mb-8 max-w-xl text-base text-muted-foreground sm:text-lg`}
                style={step(2)}
              >
                Knowledge you can govern. Answers you can trace. Boundaries agents can respect.
              </p>

              <div className={styles.rise} style={step(3)}>
                {firstDocUrl ? (
                  <Link className={styles.action} to={firstDocUrl}>
                    Browse the knowledge
                    <ArrowRightIcon />
                  </Link>
                ) : (
                  <p className="m-0 max-w-xl text-base text-muted-foreground sm:text-lg">
                    the record is empty — add a document to <code>knowledge/</code>
                  </p>
                )}
              </div>
            </div>
          </div>
        </header>
      </main>
    </Layout>
  );
}
