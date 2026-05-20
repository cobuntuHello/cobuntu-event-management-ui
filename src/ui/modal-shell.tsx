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
}

export function ModalShell({ children, onClose, width }: ModalShellProps) {
  return (
    <Shared
      onClose={onClose}
      width={width ?? "w-[420px]"}
      hideCloseButton
      maxHeight="90vh"
    >
      {children}
    </Shared>
  );
}
