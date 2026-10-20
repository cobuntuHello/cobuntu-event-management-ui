"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { stepLabel, BannerPlaceholder, usePortalTarget, type CreateStepId } from "@cobuntu/management-ui-shared";
import { useWizardT, type NamespacedT } from "./i18n";
import type { EventDraftSummary } from "./types";

/**
 * "Continue where you left off": the first step when unfinished drafts exist.
 * Lifted from the community app (components/shared/ResumeDraftStep.tsx), the
 * event flavour, unchanged in markup.
 *
 * A step and not a banner, because a notice above a form is exactly what
 * people scroll past, and autosave means drafts now exist without anyone
 * having decided to make one. Each row says how far it got ("Left on Pricing",
 * the rail's own words) so two half-written events can be told apart.
 *
 * Discard asks first, in a modal that names the draft: nothing can bring a
 * discarded draft back. The modal portals out of StepPane's transformed slide
 * wrapper (a fixed overlay resolves against a transformed ancestor otherwise),
 * into the host's container when one is provided.
 */
export interface ResumeDraftStepProps {
  drafts: EventDraftSummary[];
  onResume: (draft: EventDraftSummary) => void;
  communityName: string;
  /** The row being opened, while that is in flight. */
  resumingId?: string | null;
  onDiscard?: (draft: EventDraftSummary) => Promise<void> | void;
  disabled?: boolean;
  translationNamespace?: string;
}

function relativeTime(iso: string, t: NamespacedT): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return t("draftJustNow");
  if (mins < 60) return t("draftMinutesAgo", { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("draftHoursAgo", { count: hours });
  return t("draftDaysAgo", { count: Math.round(hours / 24) });
}

export function ResumeDraftStep({
  drafts, onResume, communityName,
  resumingId = null, onDiscard, disabled = false,
  translationNamespace = "eventsUi.createEventClient",
}: ResumeDraftStepProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const t = useWizardT(translationNamespace);
  const portalTarget = usePortalTarget();

  // Esc closes, but never while the delete itself is running.
  useEffect(() => {
    if (!confirming || discarding) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirming(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, discarding]);

  return (
    // No width cap of its own: the column owns the measure.
    <div>
      <div className="flex flex-col gap-2">
        {drafts.map((draft) => {
          const where = draft.draftStep ? stepLabel("event", draft.draftStep as CreateStepId) : null;
          const meta = [
            where ? t("draftLeftOn", { step: where }) : null,
            relativeTime(draft.updatedAt, t),
          ].filter(Boolean).join(" · ");
          const opening = resumingId === draft.id;

          return (
            <div key={draft.id} className="relative">
            <button
              type="button"
              onClick={() => onResume(draft)}
              disabled={disabled || !!resumingId}
              aria-busy={opening}
              className={`group flex w-full items-center gap-3.5 rounded-[var(--button-radius,0.75rem)] border py-3.5 pl-4 text-left transition-colors cursor-pointer ${onDiscard ? "pr-14" : "pr-4"} ${
                opening
                  ? "border-current/25 bg-current/[0.03]"
                  : "border-current/[0.12] hover:border-current/25 hover:bg-current/[0.03] disabled:opacity-40"
              }`}
            >
              {/* A gradient seeded on the draft id: drafts never carry an image,
                  and the same artwork every visit is what makes a row recognisable. */}
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" aria-hidden="true">
                <BannerPlaceholder seed={draft.id} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[14.5px] font-medium leading-snug">
                    {draft.name}
                  </span>
                  {/* WHOSE it is: a community-owned draft resumes into different
                      ownership and payouts than the member's own. */}
                  {draft.communityId && (
                    <span className="shrink-0 rounded-full bg-current/[0.08] px-2 py-0.5 text-[11px] font-medium opacity-70">
                      {communityName}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] opacity-60">{meta}</span>
              </span>

              {opening ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 animate-spin opacity-70" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.2-8.6" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-30 transition-all group-hover:translate-x-0.5 group-hover:opacity-70" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </button>

            {/* Outside the row BUTTON: a button inside a button is invalid and
                the browser's recovery breaks Continue. */}
            {onDiscard && !resumingId && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                <button
                  type="button"
                  onClick={() => setConfirming(draft.id)}
                  aria-label={t("draftDiscard")}
                  className="rounded-[var(--button-radius,0.375rem)] p-1.5 text-red-600 opacity-45 transition-opacity hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              </span>
            )}
            </div>
          );
        })}
      </div>

      {onDiscard && confirming && (() => {
        const target = drafts.find((d) => d.id === confirming);
        if (!target) return null;
        const busy = discarding === confirming;
        const close = () => { if (!busy) setConfirming(null); };
        if (!portalTarget) return null;
        return createPortal(
          <div
            className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4"
            onClick={close}
            role="dialog"
            aria-modal="true"
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[400px] bg-white text-zinc-900 rounded-2xl shadow-xl p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-[16px] font-semibold">{t("draftDiscard")}</h3>
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  aria-label={t("draftDiscardClose")}
                  className="-mr-1 -mt-1 shrink-0 grid h-7 w-7 place-items-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-[13.5px] text-zinc-500 leading-relaxed">
                {t("draftDiscardBody", { name: target.name ?? "" })}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="px-4 py-2 rounded-[var(--button-radius,0.5rem)] text-[13px] font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 cursor-pointer"
                >
                  {t("draftDiscardCancel")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setDiscarding(target.id);
                    // The parent filters the row out as soon as onDiscard marks
                    // it, so close first rather than sit open over nothing.
                    setConfirming(null);
                    try { await onDiscard(target); } finally { setDiscarding(null); }
                  }}
                  className="px-4 py-2 rounded-[var(--button-radius,0.5rem)] text-[13px] font-medium bg-red-600 text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  {t("draftDiscardConfirm")}
                </button>
              </div>
            </div>
          </div>,
          portalTarget,
        );
      })()}
    </div>
  );
}
