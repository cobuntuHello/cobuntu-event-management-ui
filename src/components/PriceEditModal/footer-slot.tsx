"use client";

import { createContext } from "react";

/**
 * The modal footer exposes a single "step actions" slot (a real DOM
 * node) through this context. Steps that own primary actions (e.g. the
 * form builder's "+ Question") render those buttons with `createPortal`
 * into this node instead of inside their own body.
 *
 * Why a portal and not lifted state: the buttons stay part of the step's
 * own render tree, so their onClick closures always see fresh state — no
 * prop-drilling through StepView, no stale-closure bugs, no re-register
 * effect loops. The footer just provides the landing spot.
 *
 * The value is the slot element (or null before the footer mounts).
 * Steps guard on null. The slot is `display: contents`, so portaled
 * buttons participate directly in the footer's flex row.
 */
export const FooterSlotContext = createContext<HTMLElement | null>(null);
