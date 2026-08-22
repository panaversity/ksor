import type { ReactElement } from "react";

/**
 * The cover's illustration: one governed source, three projections.
 *
 * Drawn from the product's own definition rather than from a mood board — KSoR
 * makes "the same institutional truth available through multiple synchronized
 * projections", and "all derive from the same authoritative source" (README).
 * So the picture is one sealed sheet on the left, and the surfaces it projects
 * into on the right: the pages a person reads, the markdown a consumer fetches,
 * the door an agent connects through. The connectors run one way, from the
 * source outward, because that direction is the whole claim: nothing on the
 * right is authored, and none of it can disagree with the left.
 *
 * Drawn rather than shipped as a picture, for three reasons a scaffold cares
 * about: no binary in the adopter's repo and no request at runtime; it follows
 * the theme, because every stroke is `currentColor` or a token; and it stays
 * sharp at any size. An adopter who wants their own artwork replaces this file.
 */
export function RecordArtwork(): ReactElement {
  const projections = [
    { y: 34, label: "pages" },
    { y: 112, label: "markdown" },
    { y: 190, label: "agents" },
  ] as const;

  return (
    <svg
      viewBox="0 0 340 260"
      className="w-full max-w-lg"
      role="img"
      aria-label="One governed source projected into pages, markdown and an agent interface"
    >
      {/* The projections leave the source; they never arrive at it. */}
      <g fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.25">
        {projections.map((projection, index) => (
          <path
            key={projection.label}
            d={`M132 130 C 166 130, 166 ${projection.y + 26}, 196 ${projection.y + 26}`}
            strokeDasharray="140"
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:[animation-fill-mode:backwards]"
            style={{ animationDelay: `${640 + index * 120}ms` }}
          />
        ))}
      </g>

      {/* The source: one sheet, sealed. It is drawn heavier than anything it
          projects into, because that is the relationship. */}
      <g className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-700 motion-safe:[animation-delay:460ms] motion-safe:[animation-fill-mode:backwards]">
        <rect
          x="16"
          y="52"
          width="116"
          height="156"
          rx="7"
          fill="var(--ksor-cover-panel)"
          stroke="currentColor"
          strokeOpacity="0.34"
        />
        <rect x="32" y="74" width="58" height="7" rx="3.5" fill="currentColor" fillOpacity="0.5" />
        {[96, 112, 128, 144, 160].map((y, index) => (
          <rect
            key={y}
            x="32"
            y={y}
            width={index === 4 ? 52 : 84}
            height="4"
            rx="2"
            fill="currentColor"
            fillOpacity="0.18"
          />
        ))}
        {/* The seal — the only saturated mark in the drawing, on the only
            surface that carries authority. */}
        <circle cx="112" cy="186" r="15" fill="var(--ksor-cover-panel)" />
        <circle
          cx="112"
          cy="186"
          r="15"
          fill="var(--color-fd-primary)"
          fillOpacity="0.14"
          stroke="var(--color-fd-primary)"
          strokeOpacity="0.55"
        />
        <path
          d="M106 186.5l4.5 4.5 8-9"
          fill="none"
          stroke="var(--color-fd-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {projections.map((projection, index) => (
        <g
          key={projection.label}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-500 motion-safe:[animation-fill-mode:backwards]"
          style={{ animationDelay: `${760 + index * 120}ms` }}
        >
          <rect
            x="196"
            y={projection.y}
            width="128"
            height="52"
            rx="6"
            fill="currentColor"
            fillOpacity="0.04"
            stroke="currentColor"
            strokeOpacity="0.2"
          />

          {/* Each projection wears the texture of what it actually is: prose
              for the pages, monospace runs for the markdown, a socket for the
              interface an agent connects through. */}
          {index === 0
            ? [14, 24, 34].map((offset, line) => (
                <rect
                  key={offset}
                  x="212"
                  y={projection.y + offset}
                  width={line === 2 ? 58 : 96}
                  height="3.5"
                  rx="1.75"
                  fill="currentColor"
                  fillOpacity="0.22"
                />
              ))
            : null}

          {index === 1
            ? [0, 1, 2].map((row) =>
                [0, 1, 2, 3, 4, 5].map((column) => (
                  <rect
                    key={`${row}-${column}`}
                    x={212 + column * 12}
                    y={projection.y + 15 + row * 10}
                    width={(row + column) % 3 === 0 ? 6 : 9}
                    height="3.5"
                    rx="1"
                    fill="currentColor"
                    fillOpacity="0.2"
                  />
                )),
              )
            : null}

          {index === 2 ? (
            <>
              <rect
                x="212"
                y={projection.y + 16}
                width="20"
                height="20"
                rx="5"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.3"
              />
              <path
                d={`M232 ${projection.y + 26} h18`}
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeWidth="1.25"
              />
              <circle
                cx="256"
                cy={projection.y + 26}
                r="5"
                fill="currentColor"
                fillOpacity="0.22"
              />
              <path
                d={`M262 ${projection.y + 26} h22`}
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeWidth="1.25"
              />
              <circle
                cx="290"
                cy={projection.y + 26}
                r="5"
                fill="currentColor"
                fillOpacity="0.22"
              />
            </>
          ) : null}

          <text
            x="320"
            y={projection.y + 46}
            textAnchor="end"
            fill="currentColor"
            fillOpacity="0.4"
            className="font-mono text-[9px] tracking-widest uppercase"
          >
            {projection.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
