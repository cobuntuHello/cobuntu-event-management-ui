/**
 * Re-export of `ModalShell` from `@cobuntu/management-ui-shared`.
 *
 * The shared primitive is API-compatible with the previous local
 * component — it accepts the same `children` / `onClose` / `width`
 * props (the `width` preset short-codes "sm" | "md" | "lg" coexist
 * with the raw Tailwind classes that existing call-sites already pass).
 *
 * The shared version additionally exposes `title`, `subtitle`,
 * `headerExtra`, `footer`, `dismissOnBackdrop`, and a fixed max-height
 * with internal scroll. Existing call-sites that don't pass title or
 * footer collapse to body-only, matching prior behavior.
 *
 * The shared shell renders a default close button in its header — we
 * force `hideCloseButton: true` here so call-sites that bring their
 * own close affordance inside `children` don't double up. Components
 * adopting the new slot-based layout can pass `hideCloseButton={false}`
 * (or the new `Modal` directly) once they're refactored.
 */
export {
  ModalShell as SharedModalShell,
  type ModalShellProps as SharedModalShellProps,
} from "@cobuntu/management-ui-shared";

import * as React from "react";
import { ModalShell as Shared } from "@cobuntu/management-ui-shared";

export interface ModalShellProps {
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
  /** Forwarded to the shared panel — e.g. a fixed height like "h-[640px]"
   *  so the modal keeps the same dimensions regardless of content. */
  className?: string;
}

export function ModalShell({ children, onClose, width, className }: ModalShellProps) {
  // Mobile-responsive width: pin to full viewport width on phones,
  // honour the requested desktop width above the `sm` breakpoint
  // (640px). Call-sites still pass plain Tailwind width tokens like
  // `w-[600px]`; the wrapper prefixes `w-full sm:` so every modal
  // collapses to a phone-sized sheet without per-site changes.
  const responsiveWidth = `w-full sm:${width ?? "w-[420px]"}`;
  return (
    <Shared
      onClose={onClose}
      width={responsiveWidth}
      hideCloseButton
      maxHeight="90vh"
      className={className}
    >
      {children}
    </Shared>
  );
}
