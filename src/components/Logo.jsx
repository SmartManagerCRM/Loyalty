import React from "react";
import { C } from "./theme";

// The SmartManager Loyalty mark: a return-loop arrow orbiting a center
// dot — literally "the customer who keeps coming back." Same glyph as
// public/favicon.svg; keep the two in sync if this ever changes.
function Glyph({ color = "#fff", size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      <g transform="rotate(-45 50 50)">
        <circle cx="50" cy="50" r="27" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray="127 43" />
        <polygon points="59,23 47,17 47,29" fill={color} />
      </g>
      <circle cx="50" cy="50" r="10" fill={color} />
    </svg>
  );
}

// variant="badge": colored rounded-square with the white glyph (sidebar,
//   login, anywhere the mark stands alone on a light background).
// variant="mark": bare glyph in `color`, no background — for placing on
//   an already-colored surface, or faint/low-opacity empty-state use.
// variant="wordmark": badge + "SmartManager / Loyalty" lockup.
export default function Logo({ variant = "badge", size = 36, color = C.green, className = "" }) {
  if (variant === "mark") {
    return <Glyph color={color} size={size} className={className} />;
  }

  const badge = (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl ${className}`}
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Glyph size={size * 0.56} />
    </div>
  );

  if (variant === "badge") return badge;

  return (
    <div className="flex items-center gap-2.5">
      {badge}
      <div>
        <div className="text-sm font-bold leading-tight" style={{ color: C.ink }}>SmartManager</div>
        <div className="text-xs leading-tight" style={{ color: C.slateLight }}>Loyalty</div>
      </div>
    </div>
  );
}
