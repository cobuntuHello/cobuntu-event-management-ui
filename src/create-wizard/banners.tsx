"use client";

import { useEffect, useRef } from "react";
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
