/**
 * ModeToggle — the color-mode control.
 *
 * Ported unchanged from the predecessor's sor-site shell (decision 6). Its
 * whole behaviour is `useColorMode()` from @docusaurus/theme-common; the
 * light/dark swap is pure CSS on [data-theme], and the two glyphs are inline
 * SVG so no icon library ships for them.
 *
 * It is load-bearing here rather than spare: this shell replaces Docusaurus's
 * navbar, and the stock bar is where the framework's own toggle lives.
 */

import type { ReactElement } from "react";
import { useColorMode } from "@docusaurus/theme-common";
import styles from "./styles.module.css";

export function ModeToggle(): ReactElement {
  const { colorMode, setColorMode } = useColorMode();

  const toggleTheme = () => {
    setColorMode(colorMode === "dark" ? "light" : "dark");
  };

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label="Toggle color mode"
      data-vsor="mode-toggle"
    >
      <svg
        className={styles.sun}
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
      <svg
        className={styles.moon}
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>
  );
}

export default ModeToggle;
