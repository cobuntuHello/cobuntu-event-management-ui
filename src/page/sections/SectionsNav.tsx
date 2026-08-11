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
export type ViewKey = "overview" | "hosts" | "listings" | "agenda" | "attendees" | "activity" | "updates";

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
}

// Attendees-first ordering: the Attendees tab is the most-trafficked
// host surface day-to-day (approve, refund, message). Putting it
// before Hosts mirrors what hosts actually do — they manage the room
// they're filling, not their co-hosts.
const SECTIONS: Section[] = [
  { label: "Overview", key: "overview" },
  { label: "Attendees", key: "attendees" },
  { label: "Hosts", key: "hosts" },
  { label: "Listings", key: "listings" },
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
export function SectionsNav({ communityTag: _communityTag, activeView, onViewChange }: Props) {
  const tabRefs = useRef<Map<ViewKey, HTMLButtonElement | null>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  function recompute() {
    const node = tabRefs.current.get(activeView);
    if (!node || !containerRef.current) return;
    const containerLeft = containerRef.current.scrollLeft;
    setIndicator({ left: node.offsetLeft - containerLeft, width: node.offsetWidth });
  }

  useLayoutEffect(() => { recompute(); }, [activeView]);

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
    <div
      ref={containerRef}
      className="relative flex items-center gap-1 overflow-x-auto -mx-1 px-1 mb-6 border-b border-zinc-200"
    >
      {SECTIONS.map((s) => {
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
  );
}
