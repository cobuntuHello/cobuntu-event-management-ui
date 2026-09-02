"use client";

import { useState, useRef, useEffect } from "react";
import { formatEventDate, formatEventTime, getTimezoneAbbr, PencilIcon } from "../helpers";
import { EventBannerPlaceholder } from "../../ui/event-banner-placeholder";

interface Props {
  event: any;
  communityTag: string;
  isPublished: boolean;
  isPast: boolean;
  isLive: boolean;
  isPaid: boolean;
  attendeeCount: number;
  missingRequirements: string[];
  onEditName: () => void;
  onEditDateTime: () => void;
  onEditLocation: () => void;
  onEditPrice: () => void;
  onEditSlug: () => void;
  onEditBanner: () => void;
  // feat/manage-event-restructure: Distribution moved from a quick-edit
  // row to a row inside the SettingsDrawer. The prop is gone; the parent
  // (OverviewView) no longer passes it.
  // Description + Tags moved IN from the legacy EditEventDrawer and are
  // now quick-edit cards alongside Name / Slug / Location / Date / Price.
  onEditTags: () => void;
}

export function EventCard({
  event, communityTag, isPublished, isPast, isLive, isPaid, attendeeCount, missingRequirements,
  onEditName, onEditDateTime, onEditLocation, onEditPrice, onEditSlug, onEditBanner,
  onEditTags,
}: Props) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [imgSize, setImgSize] = useState(280);
  const rightRef = useRef<HTMLDivElement>(null);
  const startDate = event?.startDate ? new Date(event.startDate) : null;
  const endDate = event?.endDate ? new Date(event.endDate) : null;

  useEffect(() => {
    if (!rightRef.current) return;
    const observer = new ResizeObserver(([entry]) => { setImgSize(entry.contentRect.height); });
    observer.observe(rightRef.current);
    return () => observer.disconnect();
  }, []);

  async function copyEventLink() {
    const url = `https://${communityTag}.cobuntu.com/events/${event.slug || event.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch { /* */ }
  }


  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
      <div className="flex flex-col sm:flex-row p-4 sm:p-5 gap-4 sm:gap-5">

        {/* Left: Event Image — on desktop a 1:1 square sized to the
            info column's height (inline style below). On mobile that
            square is overridden to a full-width 16:9 banner so the
            image doesn't squeeze the info rows into nothing. The
            `max-sm:!*` utilities force-override the inline style at
            < 640px. */}
        <div className="shrink-0 overflow-hidden rounded-xl relative group max-sm:!w-full max-sm:!h-auto max-sm:aspect-[16/9]" style={{ width: imgSize, height: imgSize }}>
            <button onClick={() => { if (!isPast) onEditBanner(); }} className="absolute inset-0 w-full h-full z-10 cursor-pointer" style={{ bottom: "40px" }} />
            {event.bannerUrl ? (
              <img src={event.bannerUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <EventBannerPlaceholder seed={event.name || event.id} />
            )}
            {!isPast && (
              <div onClick={onEditBanner}
                className="absolute top-3 right-3 h-8 w-8 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center cursor-pointer hover:bg-black/80 transition-all z-20 opacity-0 group-hover:opacity-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </div>
            )}
            <button onClick={copyEventLink}
              className={`absolute bottom-0 left-0 right-0 backdrop-blur-md px-4 py-2.5 flex items-center gap-3 cursor-pointer rounded-b-xl border-t border-white/10 transition-all z-20 ${
                urlCopied ? "bg-emerald-600/90" : "bg-black/70 hover:bg-black/80"
              }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${urlCopied ? "bg-white/20" : "bg-white/10"}`}>
                {urlCopied ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="opacity-80"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                )}
              </div>
              <span className="text-sm font-medium text-white/90">{urlCopied ? "Link copied!" : "Copy event link"}</span>
            </button>
        </div>

        {/* Right: Info Rows */}
        <div ref={rightRef} className="flex-1 flex flex-col justify-between min-h-0">
          <div className="flex flex-col gap-1 flex-1">
            {/* Name */}
            <InfoRow onClick={!isPast ? onEditName : undefined} disabled={isPast}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>}>
              <p className="text-sm font-medium text-zinc-900 truncate">{event.name || "Untitled Event"}</p>
            </InfoRow>

            {/* Slug. Locks once the event is published — changing the
                slug after publish breaks every shared link (DMs, emails,
                calendar entries, partner sites). Hosts can still rename
                while in Draft. */}
            <InfoRow onClick={!isPublished ? onEditSlug : undefined} disabled={isPublished}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>}>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-400">
                  Slug{isPublished && <span className="ml-1 text-zinc-300">(locked — would break shared links)</span>}
                </p>
                <p className="text-sm font-medium text-zinc-900 truncate">{event.slug || "Not set"}</p>
              </div>
            </InfoRow>

            {/* Distribution moved to SettingsDrawer (feat/manage-event-restructure). */}

            {/* Location */}
            <InfoRow onClick={!isPast ? onEditLocation : undefined} disabled={isPast}
              icon={event.onlineUrl && !event.physicalLocation
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              }>
              {event.physicalLocation && <p className="text-sm font-medium text-zinc-900">{event.physicalLocation}</p>}
              {event.onlineUrl && <p className="text-sm font-medium text-zinc-900 truncate">{event.onlineUrl}</p>}
              {!event.physicalLocation && !event.onlineUrl && (
                <p className="text-sm text-zinc-400 italic">{isPast ? "Location was never set" : "Location to be announced"}</p>
              )}
            </InfoRow>

            {/* Date */}
            <InfoRow onClick={!isPast ? onEditDateTime : undefined} disabled={isPast}
              customIcon={
                <div className="shrink-0 w-11 h-11 rounded-lg border border-zinc-200 overflow-hidden flex flex-col relative">
                  <div className="flex flex-col w-full h-full group-hover:opacity-0 transition-opacity">
                    <div className="bg-zinc-100 px-1.5 py-0.5 flex items-center justify-center">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                        {startDate ? startDate.toLocaleDateString("en-US", { month: "short" }) : "---"}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <span className="text-lg font-bold text-zinc-900 leading-none">{startDate ? startDate.getDate() : "?"}</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-100"><PencilIcon /></div>
                </div>
              }>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900">{startDate ? formatEventDate(event.startDate) : "No date set"}</p>
                  {isLive && <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">Live</span>}
                  {isPast && <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">Ended</span>}
                </div>
                {startDate && endDate && (
                  <p className="text-sm text-zinc-500">
                    {formatEventTime(event.startDate)} - {formatEventTime(event.endDate)}
                    {event.timezone && ` · ${getTimezoneAbbr(event.timezone)}`}
                  </p>
                )}
              </div>
            </InfoRow>

            {/* Price */}
            <InfoRow onClick={!isPast ? onEditPrice : undefined} disabled={isPast}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>}>
              <p className="text-sm font-medium text-zinc-900">
                {isPaid ? `${event.currency || "EUR"} ${Number(event.price).toFixed(2)}` : "Free"}
              </p>
            </InfoRow>

            {/* Tags */}
            <InfoRow onClick={onEditTags}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>}>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-400">Tags</p>
                <p className="text-sm font-medium text-zinc-900 truncate">
                  {event.tags && event.tags.length > 0
                    ? event.tags.map((t: any) => t.name || t.tag?.name).filter(Boolean).join(", ")
                    : "Add tags..."}
                </p>
              </div>
            </InfoRow>

            {/* Publish Status */}
            <div className="flex items-start gap-3 rounded-lg py-1">
              <div className={`shrink-0 w-11 h-11 rounded-lg border flex items-center justify-center ${
                isPublished ? "border-emerald-200 bg-emerald-50" :
                isPast ? "border-zinc-200 bg-zinc-50" :
                missingRequirements.length > 0 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"
              }`}>
                {isPublished ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isPast ? "text-zinc-400" : "text-amber-500"}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[2.75rem]">
                {isPast ? (
                  <p className="text-sm font-medium text-zinc-500">Event has ended</p>
                ) : isPublished ? (
                  <p className="text-sm font-medium text-emerald-600">Event is published</p>
                ) : missingRequirements.length > 0 ? (
                  // 2026-06-15 (feat/publish-tier-requirement): each missing
                  // requirement now renders as a clickable row that opens
                  // the matching edit modal — buyers go from "I don't know
                  // what's wrong" to "one click and I'm at the fix".
                  <>
                    <p className="text-sm font-medium text-amber-600 mb-1">Not published yet</p>
                    <ul className="space-y-0.5">
                      {missingRequirements.map((req) => {
                        const action = resolveMissingRequirementAction(req, {
                          onEditName, onEditDateTime, onEditLocation, onEditPrice,
                        });
                        return (
                          <li key={req}>
                            {action ? (
                              <button
                                type="button"
                                onClick={action}
                                className="text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer text-left flex items-start gap-1.5 group"
                              >
                                <span className="text-zinc-300 group-hover:text-amber-500 mt-0.5" aria-hidden>•</span>
                                <span className="group-hover:underline decoration-amber-300 underline-offset-2">
                                  {capitalize(req)}
                                </span>
                              </button>
                            ) : (
                              <span className="text-xs text-zinc-500 flex items-start gap-1.5">
                                <span className="text-zinc-300 mt-0.5" aria-hidden>•</span>
                                <span>{capitalize(req)}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm font-medium text-zinc-900">Ready to publish</p>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}

// Reusable clickable info row
function InfoRow({ children, onClick, disabled, icon, customIcon }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  icon?: React.ReactNode; customIcon?: React.ReactNode;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-3 rounded-lg transition-all text-left group py-1 ${
        onClick ? "hover:bg-zinc-50 cursor-pointer" : ""
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      {customIcon || (
        <div className="shrink-0 w-11 h-11 rounded-lg border border-zinc-200 bg-white flex items-center justify-center relative overflow-hidden">
          <div className="group-hover:opacity-0 transition-opacity">{icon}</div>
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-100"><PencilIcon /></div>
        </div>
      )}
      {children}
    </Component>
  );
}

// 2026-06-15 (feat/publish-tier-requirement): map a missingRequirements
// string to the matching edit-modal opener. Keep the strings in sync
// with the producer in helpers.tsx — any new requirement that doesn't
// map here renders as plain text (no CTA), which is the safe fallback.
function resolveMissingRequirementAction(
  req: string,
  handlers: {
    onEditName: () => void;
    onEditDateTime: () => void;
    onEditLocation: () => void;
    onEditPrice: () => void;
  },
): (() => void) | null {
  if (req === "add a title") return handlers.onEditName;
  if (req === "set a valid start date" || req === "set a valid end date") return handlers.onEditDateTime;
  if (req === "add a location") return handlers.onEditLocation;
  if (req === "publish at least one ticket tier") return handlers.onEditPrice;
  return null;
}

// Strip HTML tags + decode common entities for a short inline preview of
// the description (rich-text field). Sufficient for a single-line truncated
// preview; the full editor opens in the modal.
//
// Capped at PREVIEW_MAX chars before CSS truncate so the row doesn't visually
// eat the whole card when descriptions are long — the CSS truncate (max-w
// from `truncate` class) still finishes the job per viewport width.
//
// Decodes both named entities (&amp; &lt; &gt; &nbsp; &quot;) and numeric
// entities (&#39; &#8217; etc) — the underlying TipTap output emits both
// depending on the character. Numeric entities used to leak through as
// literal `&#39;` in the preview.
const PREVIEW_MAX = 80;
function htmlStripPreview(html: string): string {
  if (!html) return "";
  const stripped = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= PREVIEW_MAX) return stripped;
  return stripped.slice(0, PREVIEW_MAX).trimEnd() + "…";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
