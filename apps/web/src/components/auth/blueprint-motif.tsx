/**
 * A technical-drawing motif for the auth product panel: module boxes wired
 * together like an architecture diagram, drawn stroke-by-stroke, with a slow
 * accent line sweeping down as though reading the sheet.
 *
 * Decorative only — hidden from assistive tech. Motion degrades to the final
 * drawn state under prefers-reduced-motion (see globals.css).
 */

/** Boxes are laid out on a 16-unit rhythm inside the viewBox. */
const MODULES = [
  { x: 32, y: 48, w: 128, h: 64, label: "planner" },
  { x: 208, y: 32, w: 112, h: 48, label: "agents" },
  { x: 208, y: 128, w: 112, h: 48, label: "reviewer" },
  { x: 48, y: 192, w: 96, h: 48, label: "qdrant" },
  { x: 224, y: 240, w: 96, h: 48, label: "answer" },
];

/** Connectors, with their approximate path length for the draw animation. */
const WIRES = [
  { d: "M160 80 H208", len: 48 },
  { d: "M160 96 V152 H208", len: 112 },
  { d: "M264 80 V128", len: 48 },
  { d: "M144 216 H184 V152 H208", len: 128 },
  { d: "M264 176 V240", len: 64 },
];

export function BlueprintMotif() {
  return (
    <svg
      viewBox="0 0 352 320"
      role="presentation"
      aria-hidden
      className="h-auto w-full max-w-md text-brand"
    >
      {/* Construction ticks — blueprint annotation, not structure. */}
      <g className="text-strong" stroke="currentColor" strokeWidth="1" opacity="0.7">
        <path d="M16 40 H24 M16 40 V32" />
        <path d="M336 40 H328 M336 40 V32" />
        <path d="M16 296 H24 M16 296 V304" />
        <path d="M336 296 H328 M336 296 V304" />
      </g>

      {/* Module outlines */}
      <g fill="none" strokeWidth="1.5">
        {MODULES.map((m, i) => {
          const len = (m.w + m.h) * 2;
          return (
            <g key={m.label}>
              <rect
                x={m.x}
                y={m.y}
                width={m.w}
                height={m.h}
                rx="6"
                stroke="currentColor"
                opacity="0.55"
                className="motif-draw"
                style={{ "--motif-len": len, "--motif-index": i } as React.CSSProperties}
              />
              <text
                x={m.x + 12}
                y={m.y + m.h / 2 + 4}
                className="fill-foreground-muted font-mono text-xs"
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* Connectors */}
      <g fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
        {WIRES.map((wire, i) => (
          <path
            key={wire.d}
            d={wire.d}
            className="motif-draw"
            style={
              { "--motif-len": wire.len, "--motif-index": i + MODULES.length } as React.CSSProperties
            }
          />
        ))}
      </g>

      {/* Sweep line */}
      <g className="motif-scan">
        <line x1="16" y1="0" x2="336" y2="0" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      </g>
    </svg>
  );
}
