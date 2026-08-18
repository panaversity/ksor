/**
 * ReadingProgress — how far down the document the reader is.
 *
 * Ported unchanged from the predecessor's sor-site shell (decision 6): local,
 * no backend, nothing about the record. Its colour is --vsor-reading-progress,
 * which derives from --ifm-color-primary, so the brand override recolours it.
 */

import { type ReactElement, useEffect, useState } from "react";
import styles from "./styles.module.css";

export default function ReadingProgress(): ReactElement {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      // found on copy: upstream divided unguarded — NaN width on pages
      // shorter than the viewport.
      setPercent(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className={styles.progressBarContainer} aria-hidden="true">
      <div
        className={styles.progressBar}
        data-ksor="reading-progress"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
