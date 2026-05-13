"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Modal wrapper portaled to document.body so it escapes any overflow-clipped
 * ancestor. Click outside dismisses, click inside doesn't bubble.
 *
 * Intentionally minimal — no animation, no focus trap. The components
 * consuming this rely on Radix primitives (e.g. SelectPrimitive) for their
 * own focus handling.
 */
export function ModalShell({
  children,
  onClose,
  width = "w-[420px]",
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
}) {
  // SSR guard: createPortal needs document.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-xl shadow-xl ${width} p-6 text-zinc-900`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
