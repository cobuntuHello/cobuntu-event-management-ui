"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// feat/manage-event-restructure: "invite-guests" + "add-attendees" tabs
// merged into a single "attendees" tab. The Add and Invite actions
// now live as header buttons on that tab opening modals.
//
// 2026-06-17: Listings promoted back to its own tab (was inline on
// Overview). Updates tab parked behind a "WhatsApp Updates (Coming
// Soon)" label until the WhatsApp delivery channel is built — the
// keyboard-style event-update broadcasts have low pickup vs members
// already in WhatsApp groups, so we're betting on integrating with
// where the conversation already lives.
export type ViewKey = "overview" | "ledger" | "details" | "hosts" | "listings" | "agenda" | "attendees" | "activity" | "updates";

interface Section {
  label: string;
  key: ViewKey;
  /** When true, the tab renders disabled (gray, cursor not-allowed)
   *  and clicks don't fire onViewChange. Used for "coming soon" parks. */
  disabled?: boolean;
}

interface Props {
  /** Retained for API back-compat with callers. Back-to-events lives
   *  next to the page-header Preview button now. */
  communityTag: string;
  activeView: ViewKey;
  onViewChange: (key: ViewKey) => void;
  /**
   * Which tabs this viewer may use. A member hosting their own event is not a
   * community leader, so the nav is filtered rather than rendering tabs that
   * lead to a surface they cannot operate. Omitted = show everything, which is
   * the admin app's case.
   */
  visibleViews?: readonly ViewKey[];
}

// Attendees-first ordering: the Attendees tab is the most-trafficked
// host surface day-to-day (approve, refund, message). Putting it
// before Hosts mirrors what hosts actually do — they manage the room
// they're filling, not their co-hosts.
const SECTIONS: Section[] = [
  { label: "Overview", key: "overview" },
  /*
   * Details is where the editing went.
   *
   * Overview used to BE this tab -- a column of rows that each opened a modal --
   * so opening an event answered a question nobody arrived with. Overview is now
   * a dashboard (how it is doing, whether tickets can be bought at all) and the
   * form sits second, because changing the event is the second reason to be here
   * rather than the first.
   */
  { label: "Details", key: "details" },
  /*
   * LEDGER SITS AFTER DETAILS, always.
   *
   * THIS array orders the strip -- the nav renders SECTIONS filtered by
   * visibleViews, so that list decides WHETHER a tab shows and this decides
   * WHERE. Order pinned only in the other list is pinned in the wrong place.
   */
  { label: "Ledger", key: "ledger" },
  { label: "Attendees", key: "attendees" },
  { label: "Hosts", key: "hosts" },
  /*
   * "listings" is still a valid KEY, but no longer a TAB: Overview carries one
   * section per community with that listing's own numbers and terms, plus the
   * way to ask another community to carry this. A tab that repeats the first
   * screen less well is a second place to look for one answer.
   */
  { label: "Agenda", key: "agenda" },
  // Activity log — reverse-chrono feed of every host-visible action.
  // Lives near the end so the day-to-day tabs (Attendees/Hosts/etc.)
  // stay in the primary scan position. Plan doc:
  // cobuntu-backend-monorepo/docs/features/event-activity-log.md.
  { label: "Activity", key: "activity" },
  { label: "WhatsApp Updates (Coming Soon)", key: "updates", disabled: true },
];

/**
 * Persistent horizontal sub-nav for the event manage area. Single absolutely-
 * positioned underline span animates between active tabs (Tailwind transition,
 * no framer-motion). On `prefers-reduced-motion: reduce` the transition is
 * skipped.
 */
export function SectionsNav({ communityTag: _communityTag, activeView, onViewChange, visibleViews }: Props) {
  const tabRefs = useRef<Map<ViewKey, HTMLButtonElement | null>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  /*
   * Which ends have more strip behind them. Drives the fades below.
   *
   * Kept as one object so a scroll sets state once rather than twice, and so
   * the common case -- a desktop where every tab fits and both are false --
   * settles after the first pass and stops re-rendering.
   */
  const [edges, setEdges] = useState({ left: false, right: false });

  function recompute() {
    const c = containerRef.current;
    if (!c) return;

    const node = tabRefs.current.get(activeView);
    if (node) setIndicator({ left: node.offsetLeft - c.scrollLeft, width: node.offsetWidth });

    /*
     * The 1px slack is not superstition: scrollLeft is fractional under a
     * browser zoom or a fractional device pixel ratio, so `scrollLeft < max`
     * stays true by a quarter-pixel at the end of the strip and the right
     * fade never goes away.
     */
    const max = c.scrollWidth - c.clientWidth;
    const next = { left: c.scrollLeft > 1, right: c.scrollLeft < max - 1 };
    setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }

  /*
   * Put the active tab on screen before the fades are measured.
   *
   * Landing on Activity from a saved URL used to show the first three tabs and
   * no underline anywhere, which reads as a broken nav rather than a scrolled
   * one. Done by setting scrollLeft rather than scrollIntoView: that walks
   * every scrollable ancestor and would drag the page itself.
   */
  useLayoutEffect(() => {
    const c = containerRef.current;
    const node = tabRefs.current.get(activeView);
    if (c && node) {
      const left = node.offsetLeft;
      const right = left + node.offsetWidth;
      if (left < c.scrollLeft) c.scrollLeft = left - 8;
      else if (right > c.scrollLeft + c.clientWidth) c.scrollLeft = right - c.clientWidth + 8;
    }
    recompute();
  }, [activeView, visibleViews]);

  useEffect(() => {
    function onResize() { recompute(); }
    window.addEventListener("resize", onResize);
    const c = containerRef.current;
    if (c) c.addEventListener("scroll", recompute, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (c) c.removeEventListener("scroll", recompute);
    };
  }, []);

  return (
    /*
     * THE FADES LIVE OUTSIDE THE SCROLLER, THE BORDER WITH THEM.
     *
     * An overlay inside an overflow-x-auto element scrolls away with the
     * content it is supposed to be masking. So the wrapper holds the fades and
     * the bottom rule, and only the tabs scroll. The scrollbar itself is
     * hidden: a visible one on a phone is a desktop widget rendered at the
     * wrong size, and the fade is the affordance that replaces it.
     */
    <div className="relative -mx-1 mb-6 border-b border-zinc-200">
      <div
        ref={containerRef}
        className="relative flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
      {SECTIONS.filter((s) => !visibleViews || visibleViews.includes(s.key)).map((s) => {
        const active = s.key === activeView;
        const disabled = !!s.disabled;
        return (
          <button
            key={s.key}
            ref={(el) => { tabRefs.current.set(s.key, el); }}
            onClick={disabled ? undefined : () => onViewChange(s.key)}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            title={disabled ? "Coming soon" : undefined}
            className={`relative inline-flex items-center px-3 py-3 text-[14px] whitespace-nowrap transition-colors ${
              disabled
                ? "text-zinc-300 cursor-not-allowed"
                : active
                  ? "text-zinc-900 font-medium cursor-pointer"
                  : "text-zinc-400 hover:text-zinc-700 cursor-pointer"
            }`}
          >
            {s.label}
          </button>
        );
      })}

      {/* Sliding underline */}
      {indicator && (
        <span
          aria-hidden
          className="absolute bottom-0 h-[2px] bg-zinc-900 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      </div>

      {/*
        * The fades. Present only while there is something behind that edge,
        * which is what makes them an indicator rather than decoration -- a
        * strip that fits shows neither, so a desktop never sees them.
        *
        * They sit above the rule (bottom-px) so the border reads as one
        * unbroken line under them.
        */}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 bottom-px w-8 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 motion-reduce:transition-none ${edges.left ? "opacity-100" : "opacity-0"}`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute right-0 top-0 bottom-px w-8 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 motion-reduce:transition-none ${edges.right ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/** The tab order, for tests that assert it without rendering the strip. */
export const SECTION_KEYS: ViewKey[] = SECTIONS.map((s) => s.key);
