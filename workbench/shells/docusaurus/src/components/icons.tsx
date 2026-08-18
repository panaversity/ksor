/**
 * The four icons this shell draws, inline.
 *
 * The predecessor imported them from `lucide-react` and kept an allowlist of
 * thirty-seven names so a navbar item could ask for one by string. That is a
 * config vocabulary — `icon:` on a themeConfig item — and the record has no
 * such key; the whole library then ships for the handful of glyphs actually
 * drawn. Its own ModeToggle had already made this trade in the other direction
 * ("the lucide Sun/Moon icons became a plain button with inline SVGs"), so this
 * finishes the job: four paths, no dependency, nothing to tree-shake.
 *
 * All four are lucide geometry (ISC), drawn at lucide's own 24-unit grid and
 * 2-unit stroke so they sit on the same optical weight as the two the
 * ModeToggle already carries.
 */
import type { ReactElement, ReactNode } from "react";

interface IconProps {
  readonly className?: string;
}

function Svg({
  className,
  children,
  strokeWidth = 2,
}: IconProps & { children: ReactNode; strokeWidth?: number }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MenuIcon({ className }: IconProps): ReactElement {
  return (
    <Svg className={className}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps): ReactElement {
  return (
    <Svg className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function ArrowRightIcon({ className }: IconProps): ReactElement {
  return (
    <Svg className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Svg>
  );
}

export function FolderOpenIcon({ className }: IconProps): ReactElement {
  return (
    <Svg className={className} strokeWidth={1.5}>
      <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}
