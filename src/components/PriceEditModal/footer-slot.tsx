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

/**
 * Work a step has started but not yet committed, which the modal's Save must
 * commit FIRST. A step registers a callback while it holds such work and
 * unregisters when it no longer does; Save awaits every registered callback
 * before writing the tiers.
 *
 * Why it exists: the question editor confirms a question with its own small
 * "Add question" button, but the modal's big Save sits under it, pinned and
 * always visible. A host who wrote a question and pressed Save got the tier
 * saved and the modal closed, with the question silently dropped (Impact Hub
 * Porto, 2026-11-06). Save now means "save what I am looking at", question
 * included.
 */
export type PendingCommit = () => void | Promise<void>;
export const PendingCommitContext = createContext<((fn: PendingCommit) => () => void) | null>(null);
