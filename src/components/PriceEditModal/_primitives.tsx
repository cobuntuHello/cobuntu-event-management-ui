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
    // With a prefix, lay the symbol out as a real leading flex element
    // rather than an absolute overlay. The old overlay assumed a 1-char
    // symbol and reserved a fixed `pl-7`; multi-char symbols (R$, CHF,
    // CA$) overflowed it and collided with the value/placeholder — the
    // "broken" look. As a flex sibling the input always starts cleanly
    // after the symbol regardless of its width. The border + focus ring
    // move to the wrapper (focus-within) so the field reads as one unit.
    return (
      <div
        className={[
          "flex items-center w-full text-[13px] rounded-lg border border-zinc-200",
          isDisabled
            ? "bg-zinc-50 cursor-not-allowed"
            : "bg-white focus-within:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-200",
        ].join(" ")}
      >
        <span className={`pl-3 pr-1.5 shrink-0 select-none ${isDisabled ? "text-zinc-300" : "text-zinc-400"}`}>
          {prefix}
        </span>
        <input
          ref={ref}
          {...rest}
          disabled={isDisabled}
          className={[
            "min-w-0 flex-1 bg-transparent py-2 pr-3 rounded-r-lg focus:outline-none",
            isDisabled ? "text-zinc-400" : "text-zinc-900 placeholder:text-zinc-400",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            className ?? "",
          ].join(" ")}
        />
      </div>
    );
  },
);

/**
 * Switch — a compact on/off toggle. Used where flipping the control
 * IS the action (e.g. publish a tier) rather than staging a value for a
 * later Save. Accessible: role="switch" + aria-checked.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  id,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-zinc-900" : "bg-zinc-300",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
