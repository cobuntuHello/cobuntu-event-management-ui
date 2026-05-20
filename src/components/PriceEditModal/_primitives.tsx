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

/**
 * Step-density inputs. Centralize the className that every step / sub-flow
 * was using inline (`px-3 py-2 text-[13px] border border-zinc-200 rounded-lg
 * focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200`).
 * Visually identical to the inline pattern — pure refactor that prevents
 * future drift.
 *
 * Distinct from the shared package's `TextField` / `NumberField` primitives:
 * those target full-width modal forms (h-10, label slot, hint slot). The
 * tier-card step views are cramped and need the denser py-2 sizing.
 */
const STEP_INPUT_BASE =
  "w-full text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200";

const STEP_INPUT_LOCKED = "text-zinc-400 bg-zinc-50 cursor-not-allowed";

export interface StepInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  /** Optional currency / unit slot rendered inside the input's left edge. */
  prefix?: React.ReactNode;
  /** Visual lock state — disabled + greyed. Sales-lock guards on tiers use
   *  this. */
  locked?: boolean;
}

export const StepInput = React.forwardRef<HTMLInputElement, StepInputProps>(
  function StepInput({ prefix, locked, className, disabled, ...rest }, ref) {
    const isDisabled = locked || disabled;
    if (!prefix) {
      return (
        <input
          ref={ref}
          {...rest}
          disabled={isDisabled}
          className={[
            STEP_INPUT_BASE,
            "px-3 py-2",
            isDisabled ? STEP_INPUT_LOCKED : "text-zinc-900 placeholder:text-zinc-400",
            // Strip native spin buttons on number inputs — every existing
            // call-site added this so just bake it in.
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            className ?? "",
          ].join(" ")}
        />
      );
    }
    // With a prefix, position the affordance inside the input's bounds.
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">
          {prefix}
        </span>
        <input
          ref={ref}
          {...rest}
          disabled={isDisabled}
          className={[
            STEP_INPUT_BASE,
            "pl-7 pr-3 py-2",
            isDisabled ? STEP_INPUT_LOCKED : "text-zinc-900 placeholder:text-zinc-400",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            className ?? "",
          ].join(" ")}
        />
      </div>
    );
  },
);
