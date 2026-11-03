"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig } from "../config";
import { missingRequirementLabel } from "../page/helpers";
import { useEventT } from "../create-wizard/i18n";

interface Props {
  event: any;
  communityTag: string;
  isPublished: boolean;
  isPaid: boolean;
  attendeeCount: number;
  missingRequirements: string[];
  onClose: () => void;
  onDone: () => void;
  showToast: (msg: string) => void;
}

export function PublishModal({ event, communityTag, isPublished, isPaid, attendeeCount, missingRequirements, onClose, onDone, showToast }: Props) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const [saving, setSaving] = useState(false);
  const t = useEventT("eventsUi.manageUi.publishModal");
  const tc = useEventT("eventsUi.manageUi.overviewCommon");

  async function execute() {
    const endpoint = isPublished ? "unpublish" : "publish";
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/${endpoint}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) { showToast(isPublished ? t("unpublished") : t("published")); onDone(); }
      else {
        const err = await res.json().catch(() => ({}));
        // 2026-06-15: surface the BE's detailed validation list when
        // present. EventListingService throws ValidationError('Cannot
        // publish listing', [...validationErrors]) and the controller
        // exposes both `error` (main message) AND `validationErrors[]`
        // (the actionable detail). Pre-fix the toast only showed the
        // main message, so a host who hit "Event has no published
        // ticket tier — publish at least one tier before listing" saw
        // only "Cannot publish event" with no idea what to fix.
        const details: string[] = Array.isArray(err.validationErrors) ? err.validationErrors : [];
        const baseMsg = err.error || (isPublished ? t("failedToUnpublish") : t("failedToPublish"));
        showToast(details.length > 0 ? `${baseMsg}: ${details.join(" · ")}` : baseMsg);
      }
    } catch { showToast(isPublished ? t("failedToUnpublish") : t("failedToPublish")); }
    finally { setSaving(false); }
  }

  if (isPublished) {
    return (
      <ModalShell onClose={onClose}>
        <h3 className="text-[15px] font-semibold text-zinc-900 mb-3">{t("unpublishTitle")}</h3>
        <div className="space-y-2 mb-4">
          <WarningCard color="amber"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            title={t("hiddenTitle")} subtitle={t("hiddenBody")} />
          {attendeeCount > 0 && (
            <WarningCard color="amber"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}
              title={t("attendeesRegistered", { count: attendeeCount })} subtitle={t("attendeesNotified")} />
          )}
          {isPaid && (
            <WarningCard color="blue"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>}
              title={t("autoRefundsTitle")} subtitle={t("autoRefundsBody")} />
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">{tc("cancel")}</button>
          <button onClick={execute} disabled={saving}
            className="px-4 py-2 text-[13px] font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-30 cursor-pointer">
            {saving ? t("unpublishing") : t("unpublish")}
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-3">{t("publishTitle")}</h3>
      {missingRequirements.length > 0 ? (
        <div className="rounded-lg bg-red-50 p-3 mb-4">
          <p className="text-sm font-medium text-red-600 mb-1">{t("cannotPublishYet")}</p>
          <p className="text-xs text-red-500">{t("mustBefore", { requirements: missingRequirements.map(missingRequirementLabel).join(", ") })}</p>
        </div>
      ) : (
        <div className="rounded-lg bg-emerald-50 p-3 mb-4">
          <p className="text-sm font-medium text-emerald-700">{t("readyTitle")}</p>
          <p className="text-xs text-emerald-600 mt-0.5">{t("readyBody")}</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">{tc("cancel")}</button>
        <button onClick={execute} disabled={saving || missingRequirements.length > 0}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
          {saving ? t("publishing") : t("publish")}
        </button>
      </div>
    </ModalShell>
  );
}

function WarningCard({ color, icon, title, subtitle }: { color: "amber" | "blue" | "red"; icon: React.ReactNode; title: string; subtitle: string }) {
  const bg = color === "amber" ? "bg-amber-50" : color === "blue" ? "bg-blue-50" : "bg-red-50";
  const iconColor = color === "amber" ? "text-amber-500" : color === "blue" ? "text-blue-500" : "text-red-500";
  const titleColor = color === "amber" ? "text-amber-700" : color === "blue" ? "text-blue-700" : "text-red-700";
  const subColor = color === "amber" ? "text-amber-600" : color === "blue" ? "text-blue-600" : "text-red-600";
  return (
    <div className={`rounded-lg ${bg} p-3 flex gap-3`}>
      <div className={`${iconColor} shrink-0 mt-0.5`}>{icon}</div>
      <div>
        <p className={`text-sm font-medium ${titleColor}`}>{title}</p>
        <p className={`text-xs ${subColor} mt-0.5`}>{subtitle}</p>
      </div>
    </div>
  );
}
