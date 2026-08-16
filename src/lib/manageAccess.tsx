"use client";

import React, { createContext, useCallback, useContext } from "react";

/**
 * May the viewer CHANGE this event, or only look at it?
 *
 * ── Why the manage page needed a second answer ──────────────────────────────
 *
 * Opening the manage page and editing what is on it are different permissions,
 * and the backend has always treated them that way: a leader of a community
 * that CARRIES someone's event may look at it, while editing follows OWNERSHIP
 * — the host, or a leader of the community that owns it.
 *
 * The page only ever asked the first question. So a carrying community's leader
 * got the full edit interface, and every save came back 403. The server was
 * right and the interface was lying about what it would accept.
 *
 * `canEdit` is that second answer, resolved server-side as `viewerCanEdit` by
 * the same predicate the write endpoints enforce, and threaded down here.
 *
 * ── Why a context and not a prop ────────────────────────────────────────────
 *
 * The affordances that write are spread across views, modals and drawers that
 * are several levels apart and mostly do not talk to each other. Threading a
 * boolean through all of them is how one of them ends up missing it — and a
 * missed one is not a cosmetic bug, it is a control that looks live and is not.
 *
 * DEFAULT TRUE, deliberately. Every existing consumer renders exactly as it did
 * before without changing a line; read-only is opt-in by the one page that
 * knows it is showing someone else's event. The alternative default would
 * silently freeze every surface that has not been updated yet.
 */
const ManageAccessContext = createContext<{ canEdit: boolean }>({ canEdit: true });

export function ManageAccessProvider({
  canEdit,
  children,
}: {
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <ManageAccessContext.Provider value={{ canEdit }}>{children}</ManageAccessContext.Provider>
  );
}

/** True when the viewer may change this event. */
export function useCanEdit(): boolean {
  return useContext(ManageAccessContext).canEdit;
}

/**
 * Wrap a handler that opens an editing surface.
 *
 * Gating the OPENER rather than each button is what makes this hard to get
 * wrong: a modal that cannot be opened cannot save, so a control that slips
 * through and still renders leads nowhere instead of leading to a 403.
 *
 * Returns undefined when read-only, so a button given this handler is inert
 * and — where the receiving component checks for a handler before rendering —
 * disappears rather than sitting there looking clickable.
 */
export function useEditAction<T extends (...args: any[]) => void>(fn: T): T | undefined {
  const canEdit = useCanEdit();
  const wrapped = useCallback(
    (...args: Parameters<T>) => {
      if (!canEdit) return;
      fn(...args);
    },
    [canEdit, fn],
  ) as T;
  return canEdit ? wrapped : undefined;
}
