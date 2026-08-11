"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Phase = "in" | "out";

interface Props {
  viewKey: string;
  children: ReactNode;
}

/**
 * Crossfade + slight translate-y between view swaps. ~120ms fade-out, then
 * swap children, then ~150ms fade-in. Falls back to instant swap when
 * `prefers-reduced-motion: reduce` is set.
 */
export function ViewTransition({ viewKey, children }: Props) {
  const [rendered, setRendered] = useState<{ key: string; node: ReactNode }>({ key: viewKey, node: children });
  const [phase, setPhase] = useState<Phase>("in");
  const pendingRef = useRef<{ key: string; node: ReactNode } | null>(null);

  useEffect(() => {
    if (viewKey === rendered.key) {
      setRendered({ key: viewKey, node: children });
      return;
    }
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRendered({ key: viewKey, node: children });
      setPhase("in");
      return;
    }
    pendingRef.current = { key: viewKey, node: children };
    setPhase("out");
  }, [viewKey, children, rendered.key]);

  function handleTransitionEnd() {
    if (phase === "out" && pendingRef.current) {
      const next = pendingRef.current;
      pendingRef.current = null;
      setRendered(next);
      // Yield a frame so the in-state styles take effect.
      requestAnimationFrame(() => setPhase("in"));
    }
  }

  return (
    <div
      key={rendered.key}
      onTransitionEnd={handleTransitionEnd}
      className={`transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
        phase === "out" ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
      }`}
    >
      {rendered.node}
    </div>
  );
}
