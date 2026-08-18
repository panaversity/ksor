import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";

// The same two states as the reference shell's home: a CTA derived from the
// first document in reading order, or an honest empty-record line.
export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const firstDocUrl = siteConfig.customFields?.firstDocUrl as string | null;

  return (
    <Layout>
      <main style={{ padding: "4rem 1.5rem", textAlign: "center" }}>
        {/* useBaseUrl, not a bare path: under KSOR_BASE_PATH the mark lives at
            /<base>/img/ — a bare src 404s on every sub-path deploy. */}
        <img
          src={useBaseUrl("/img/ksor-mark.png")}
          alt=""
          width={72}
          height={72}
          style={{ borderRadius: "16px" }}
        />
        <h1>{siteConfig.title}</h1>
        {firstDocUrl ? (
          <Link className="button button--primary" to={firstDocUrl}>
            Browse the knowledge
          </Link>
        ) : (
          <p>
            the record is empty — add a document to <code>knowledge/</code>
          </p>
        )}
      </main>
    </Layout>
  );
}
