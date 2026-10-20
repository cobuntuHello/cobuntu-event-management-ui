"use client";

import type * as React from "react";
import { WizardLink } from "./navigation";
import { useWizardT } from "./i18n";

/**
 * The page chrome above the wizard: the back-nav breadcrumb and the "How it
 * works" pill. Lifted from the community app (components/layout/Breadcrumb.tsx,
 * components/shared/HowItWorksButton.tsx) with next/link swapped for the host's
 * link renderer. Same markup and classes.
 *
 * The breadcrumb's back arrow is a real link to the parent (so a page opened
 * from a shared link still has somewhere to go). `onBack` runs first and may
 * consume the press (the wizard walks back through its own steps); then, when
 * the host says there is in-app history, it pops that instead.
 */
export function Breadcrumb({
  parentHref,
  parentLabel,
  currentTitle,
  maxWidthClass = "max-w-[var(--container-max-width,80rem)]",
  trailing,
  onBack,
  shouldUseHistoryBack,
}: {
  parentHref: string;
  parentLabel: string;
  currentTitle: string;
  maxWidthClass?: string;
  trailing?: React.ReactNode;
  onBack?: () => boolean | void;
  shouldUseHistoryBack?: () => boolean;
}) {
  return (
    <div className={`hidden md:flex items-center gap-2 mx-auto ${maxWidthClass} px-4 md:px-8 pt-6 pb-2`}>
      <WizardLink
        href={parentHref}
        aria-label={`Back to ${parentLabel}`}
        onClick={(e) => {
          if (onBack?.() === true) {
            e.preventDefault();
            return;
          }
          if (shouldUseHistoryBack?.()) {
            e.preventDefault();
            window.history.back();
          }
        }}
        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer no-underline"
        style={{ background: "rgba(128,128,128,0.06)", color: "var(--text-color)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,128,128,0.12)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(128,128,128,0.06)")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </WizardLink>
      <WizardLink
        href={parentHref}
        className="text-base opacity-50 hover:opacity-80 transition-opacity no-underline shrink-0"
        style={{ color: "var(--text-color)" }}
      >
        {parentLabel}
      </WizardLink>
      <span className="text-base opacity-20 shrink-0">/</span>
      <span className="text-base font-medium truncate max-w-[400px]">{currentTitle}</span>
      {trailing && <div className="ml-auto shrink-0">{trailing}</div>}
    </div>
  );
}

export function HowItWorksButton({ href, className = "" }: { href: string; className?: string }) {
  const t = useWizardT("shared.howItWorksButton");
  return (
    <WizardLink
      href={href}
      aria-label={t("ariaLabel")}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--button-radius,9999px)] border px-3 py-1.5 text-[12.5px] font-medium no-underline transition-colors ${className}`}
      style={{
        borderColor: "color-mix(in srgb, currentColor 15%, transparent)",
        color: "color-mix(in srgb, var(--text-color, #111) 70%, transparent)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, currentColor 6%, transparent)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {t("label")}
    </WizardLink>
  );
}
