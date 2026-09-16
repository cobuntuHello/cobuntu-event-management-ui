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
  // Width is passed through verbatim. Call-sites that want a mobile-
  // responsive modal pass the FULL string literally (e.g.
  // `w-full sm:w-[600px]`) so Tailwind's static class extractor sees
  // both the mobile and desktop variants in source. Building the
  // responsive class via template literal here would fail in
  // Tailwind v4 — `sm:w-[600px]` would never appear as a literal and
  // the desktop class never gets generated, leaving modals stuck at
  // full viewport width on all screens. Don't reintroduce that hack.
  return (
    <>
      {/*
       * Hide the modal's scrollbars. The tier modal scrolls in two places: the
       * shared shell's own scroll container AND PriceEditModal's inner body
       * (tagged `.emui-modal-scroll`). Mirrors pmui's `.pmui-modal-scroll`
       * approach — Firefox reads `scrollbar-width`, legacy Edge
       * `-ms-overflow-style`, WebKit the `::-webkit-scrollbar` pseudo-element.
       *
       * The shared shell owns its scroll element (it lives in
       * @cobuntu/management-ui-shared, so we can't put a class on it directly);
       * that element is a direct child of the shell's panel, which the shared
       * shell stamps with our `className`. So we tag the panel `emui-modal-panel`
       * and target its scrolling child. The rule is global but class-scoped, so
       * only these two containers lose their scrollbar.
       */}
      <style>{`.emui-modal-panel>.overflow-y-auto,.emui-modal-scroll{scrollbar-width:none;-ms-overflow-style:none}.emui-modal-panel>.overflow-y-auto::-webkit-scrollbar,.emui-modal-scroll::-webkit-scrollbar{display:none}`}</style>
      <Shared
        onClose={onClose}
        width={width ?? "w-full sm:w-[420px]"}
        hideCloseButton
        maxHeight="90vh"
        className={["emui-modal-panel", className].filter(Boolean).join(" ")}
      >
        {children}
      </Shared>
    </>
  );
}
