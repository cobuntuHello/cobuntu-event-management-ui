"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useWizardT } from "./i18n";
import { WizardLink } from "./navigation";

/**
 * "Before you host your first event in X": three things to know, shown once
 * per community per browser. Lifted from the community app
 * (components/marketplace/FirstTimeCreatorModal.tsx), event flavour, with the
 * links going through the host's renderer. Same storage key, so someone who
 * dismissed it in the app is not shown it again there.
 *
 * Renders in place (position: fixed), not through a portal, exactly as before.
 */
const STORAGE_PREFIX = "us-first-time-creator-seen";

function storageKey(communityTag: string, kind: "product" | "event") {
  return `${STORAGE_PREFIX}::${communityTag.toLowerCase()}::${kind}`;
}

const MODAL_MUTED = "color-mix(in srgb, var(--text-color) 62%, transparent)";

export function FirstTimeCreatorModal({
  communityTag,
  communityName,
  sellingGuideHref,
  fullGuideHref,
  kind = "event",
}: {
  communityTag: string;
  communityName: string;
  sellingGuideHref: string;
  fullGuideHref: string;
  kind?: "product" | "event";
}) {
  const t = useWizardT("marketplaceUi.firstTimeCreatorModal");
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(storageKey(communityTag, kind));
      setSeen(value === "1");
    } catch {
      // Storage unavailable (private mode): do not nag on every visit.
      setSeen(true);
    }
  }, [communityTag, kind]);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(communityTag, kind), "1");
    } catch { /* ignore */ }
    setSeen(true);
  }

  if (seen !== false) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ftc-modal-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl p-6"
        style={{
          background: "var(--bg-color, #ffffff)",
          color: "var(--text-color)",
          borderRadius: "var(--card-radius, 16px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ftc-modal-title" className="text-xl font-semibold mb-2" style={{ color: "var(--text-color)" }}>
          {t("heading", { kind, communityName })}
        </h2>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: MODAL_MUTED }}>
          {t("subtitle")}
        </p>

        <ul className="space-y-4 mb-6">
          <Point title={t("point1Title")}>{t("point1Body", { kind })}</Point>
          <Point title={t("point2Title")}>
            {t.rich("point2Body", {
              communityName,
              link: (chunks: ReactNode) => (
                <WizardLink href={sellingGuideHref} className="underline underline-offset-2" style={{ color: "var(--text-color)" }}>
                  {chunks}
                </WizardLink>
              ),
            })}
          </Point>
          <Point title={t("point3Title")}>{t("point3Body", { communityName })}</Point>
        </ul>

        <div className="flex items-center justify-between gap-3">
          <WizardLink href={fullGuideHref} className="text-[13px] underline underline-offset-2" style={{ color: MODAL_MUTED }}>
            {t("readFullGuide")}
          </WizardLink>
          <button
            type="button"
            onClick={dismiss}
            className="px-5 py-2.5 text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-90"
            style={{ borderRadius: "var(--button-radius, 8px)", background: "var(--primary-btn-bg, var(--brand-color))", color: "var(--primary-btn-text, #fff)" }}
          >
            {t("gotIt", { kind })}
          </button>
        </div>
      </div>
    </div>
  );
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center"
        style={{ background: "color-mix(in srgb, var(--text-color) 88%, transparent)", color: "var(--bg-color, #ffffff)" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-color)" }}>{title}</p>
        <p className="text-[13px] leading-relaxed" style={{ color: MODAL_MUTED }}>{children}</p>
      </div>
    </li>
  );
}
