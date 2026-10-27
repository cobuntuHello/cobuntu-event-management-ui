"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { WizardLink } from "./navigation";

/**
 * The wizard's error and notice banners, lifted from the community app
 * (components/ui/FormErrorBanner.tsx, FormNoticeBanner.tsx). Same markup and
 * colours: theme-aware tints mixed toward --bg-color / --text-color.
 *
 * One difference, and only in motion: the error banner's entrance was a
 * framer-motion spring and is a CSS keyframe of the same shape here (same
 * offset, scale, duration and curve), so the package does not carry
 * framer-motion. The settled banner is identical. It still scrolls itself into
 * view, because the validation that raises it fires from a footer button that
 * can be far below the field at fault.
 */
const ERROR_IN_CSS = `
@keyframes cbtFormErrorIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.99); }
  to   { opacity: 1; transform: none; }
}
.cbt-form-error-in { animation: cbtFormErrorIn 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@media (prefers-reduced-motion: reduce) { .cbt-form-error-in { animation: none; } }
`;

export function FormErrorBanner({ message, className = "" }: { message: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message && ref.current && typeof ref.current.scrollIntoView === "function") {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [message]);

  if (!message) return null;
  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: ERROR_IN_CSS }} />
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      className={`cbt-form-error-in flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${className}`}
      style={{
        background: "color-mix(in srgb, #ef4444 10%, var(--bg-color, #ffffff))",
        border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
      }}
    >
      <span
        className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, #ef4444 22%, transparent)", color: "#ef4444" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
          <line x1="12" y1="7" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
      <p className="text-[13.5px] font-medium leading-snug" style={{ color: "color-mix(in srgb, #ef4444 72%, var(--text-color, #111))" }}>
        {message}
      </p>
    </div>
    </>
  );
}

export function FormNoticeBanner({
  title,
  body,
  actionHref,
  actionLabel,
  className = "",
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}) {
  const AMBER = "#f59e0b";
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${className}`}
      style={{
        background: `color-mix(in srgb, ${AMBER} 11%, var(--bg-color, #ffffff))`,
        border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`,
      }}
    >
      <span
        className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${AMBER} 22%, transparent)`, color: AMBER }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold leading-snug" style={{ color: `color-mix(in srgb, ${AMBER} 62%, var(--text-color, #111))` }}>
          {title}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "color-mix(in srgb, var(--text-color, #111) 68%, transparent)" }}>
          {body}
        </p>
        {actionHref && actionLabel ? (
          <WizardLink
            href={actionHref}
            className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold no-underline"
            style={{ color: `color-mix(in srgb, ${AMBER} 66%, var(--text-color, #111))` }}
          >
            {actionLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </WizardLink>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Purely decorative header banner for a wizard step — icon, bold title, muted
 * subtitle. No dismiss, no action, nothing to click.
 *
 * Deliberately a SEPARATE component from `FormNoticeBanner` rather than a
 * variant of it. `FormNoticeBanner` is a warning: amber, carries an optional
 * action link, and every existing caller depends on that exact look staying
 * put. This one only orients the host at the top of a step ("here's what
 * you're about to do"), which is a different job and a different palette
 * (lavender, not amber) — folding the two into one component with a `tone`
 * prop would make every future change to either one a change neither caller
 * asked for.
 */
export function InfoBanner({
  title,
  body,
  icon,
  className = "",
}: {
  title: string;
  body: string;
  /** The glyph shown in the banner's icon chip. REQUIRED, not defaulted to a
   *  generic info-circle: each step's banner should carry an icon that
   *  reflects what that step is actually about (naming vs. money, etc.), so
   *  callers pass their own lucide icon rather than inheriting a one-size
   *  info mark. */
  icon: React.ReactNode;
  className?: string;
}) {
  // Tints off the community's own brand color (set as --brand-color by the
  // host, same variable the answered-state row checkmarks use elsewhere in
  // EventForm.tsx) instead of a fixed hex, so the banner looks native to
  // whichever community is viewing the wizard. Falls back to a neutral dark
  // zinc (not purple) when no brand color is set, matching the rest of this
  // form's neutral default palette.
  const BRAND_FALLBACK = "#27272a";
  const brandBg = `color-mix(in srgb, var(--brand-color, ${BRAND_FALLBACK}) 10%, var(--bg-color, #ffffff))`;
  const brandBorder = `color-mix(in srgb, var(--brand-color, ${BRAND_FALLBACK}) 25%, transparent)`;
  const brandIconBg = `color-mix(in srgb, var(--brand-color, ${BRAND_FALLBACK}) 20%, transparent)`;
  const brandTitle = `color-mix(in srgb, var(--brand-color, ${BRAND_FALLBACK}) 55%, var(--text-color, #111))`;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${className}`}
      style={{
        background: brandBg,
        border: `1px solid ${brandBorder}`,
      }}
    >
      <span
        className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
        style={{ background: brandIconBg, color: "var(--brand-color, " + BRAND_FALLBACK + ")" }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold leading-snug" style={{ color: brandTitle }}>
          {title}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "color-mix(in srgb, var(--text-color, #111) 68%, transparent)" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

/** Swipe-to-dismiss threshold, matching ActionModalShell's SWIPE_DISMISS_PX
 *  (node_modules/@cobuntu/management-ui-shared/src/ui/ActionModalShell.tsx)
 *  so every swipe-to-dismiss surface in the product agrees on how far is far
 *  enough. */
const TIP_SWIPE_DISMISS_PX = 80;

/** How long the close animation runs — the unmount (and `onDismiss?.()`) is
 *  deferred by this long so the fade/collapse has time to play instead of
 *  the banner vanishing instantly. Kept in one const so the CSS transition
 *  duration below and the JS setTimeout delay can't drift apart. */
const TIP_CLOSE_MS = 180;

/**
 * A dismissible "tip" banner — muted-gray circular X (not the amber warning
 * palette, this is reassurance, not a problem) plus swipe-to-dismiss on
 * mobile, adapted from ActionModalShell's drag-to-close gesture. Dismiss
 * state is local component state only: there is no dismissed-banner
 * persistence pattern anywhere else in this package (confirmed by grepping
 * src/ for "dismissed" / "localStorage" before writing this — the hits are
 * FirstTimeCreatorModal and EventCreateWizard's drafts-resume banner, both of
 * which ARE persisted, but neither exposes a reusable mechanism this banner
 * could share without taking on their storage keys). The tradeoff: the tip
 * reappears if the host reopens the wizard. That's judged fine for a "good to
 * know" aside — re-showing a harmless tip once in a while costs far less than
 * wiring up a new persistence key for it would.
 */
export function DismissibleTipBanner({
  title,
  body,
  className = "",
  onDismiss,
}: {
  title: string;
  body: string;
  className?: string;
  /** Called after the banner dismisses itself. Optional — most callers don't
   *  need to react, they just stop rendering it (it unmounts on its own). */
  onDismiss?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  // "closing" is the transitional state between the user asking to dismiss
  // (X click or swipe past the threshold) and the banner actually unmounting
  // — it drives the fade/collapse CSS below while `dismissed` (set after
  // TIP_CLOSE_MS) is what actually removes the banner from the tree and
  // fires `onDismiss`.
  const [closing, setClosing] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragActive = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function dismiss() {
    if (closing || dismissed) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDismissed(true);
      onDismiss?.();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setDismissed(true);
      onDismiss?.();
    }, TIP_CLOSE_MS);
  }

  function dragStart(y: number) {
    dragActive.current = true;
    dragStartY.current = y;
  }
  function dragMove(y: number) {
    if (dragStartY.current === null) return;
    const delta = y - dragStartY.current;
    if (delta > 0) setDragOffsetY(delta);
  }
  function dragEnd() {
    dragActive.current = false;
    if (dragOffsetY > TIP_SWIPE_DISMISS_PX) {
      dismiss();
      return;
    }
    setDragOffsetY(0);
    dragStartY.current = null;
  }

  function onTouchStart(e: React.TouchEvent) {
    dragStart(e.touches[0]?.clientY ?? 0);
  }
  function onTouchMove(e: React.TouchEvent) {
    dragMove(e.touches[0]?.clientY ?? 0);
  }
  function onTouchEnd() {
    dragEnd();
  }

  // Mouse-drag swipe on desktop, parallel to the touch handlers above —
  // pointer events would collapse touch+mouse into one handler set, but
  // mobile browsers also fire pointer events for touch, and doubling up
  // both pointer and touch handlers on the same element risks double-firing
  // the drag math. Keeping them as separate, explicit mouse handlers avoids
  // that risk entirely.
  function onMouseDown(e: React.MouseEvent) {
    dragStart(e.clientY);
    const onMove = (ev: MouseEvent) => dragMove(ev.clientY);
    const onUp = () => {
      dragEnd();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (dismissed) return null;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      style={
        closing
          ? { transform: "translateY(-6px) scaleY(0.92)", opacity: 0, maxHeight: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }
          : dragOffsetY > 0
            ? { transform: `translateY(${dragOffsetY}px)`, opacity: Math.max(0, 1 - dragOffsetY / (TIP_SWIPE_DISMISS_PX * 2)) }
            : undefined
      }
      className={`flex items-start gap-2.5 rounded-xl bg-blue-50 px-3.5 py-3 transition-[transform,opacity,max-height,margin,padding] duration-[180ms] motion-reduce:transition-none motion-reduce:!transform-none motion-reduce:!opacity-100 ${className}`}
    >
      {/* Info-blue, not the muted zinc gray every other aside in this file
          uses — this one IS informational content ("here's what you can
          still change later"), so it should read that way rather than as a
          flat neutral note. */}
      <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
        <Info className="h-[11px] w-[11px]" strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-blue-900">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-blue-700/80">{body}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="w-6 h-6 shrink-0 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center cursor-pointer transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
