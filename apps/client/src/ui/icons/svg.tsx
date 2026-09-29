import type { ReactNode } from "react";

export function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

export function Glyph({ d }: { d: string }) {
  return (
    <Svg>
      <path d={d} fillRule="evenodd" />
    </Svg>
  );
}
