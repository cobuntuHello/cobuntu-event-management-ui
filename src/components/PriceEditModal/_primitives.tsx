"use client";

import * as React from "react";

/**
 * Small UI primitives local to the PriceEditModal layout. Intentionally
 * kept in this directory (not promoted to @cobuntu/management-ui-shared)
 * because they're tuned to the cramped tier-card density — the shared
 * package's primitives target the full-width modal step layout instead.
 */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block">
      {children}
    </label>
  );
}

/**
 * Collapse — animates height-auto reveals using the grid-template-rows
 * 0fr/1fr trick. No measurement, no JS, no dependency. The inner div has
 * overflow-hidden so children clip during the transition.
 */
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
