"use client";

import * as React from "react";

/**
 * The manage page's header — breadcrumbs, identity, Back and Preview.
 *
 * It was a SLOT, so each app supplied its own. Predictably they diverged: the
 * admin app used chevron separators, zinc-400 links and icon buttons; the
 * community app used a "/" separator and plain text buttons. Same page, two
 * headers, and the difference was visible the moment you put the screenshots
 * side by side.
 *
 * The slot still exists for anything genuinely app-specific, but this is the
 * default, so "consistent unless someone deliberately opts out" replaces
 * "consistent until someone forgets".
 *
 * The ROUTES stay injected — Back goes to /:tag/events in the admin app and
 * /events in the community app, and Preview opens an absolute URL from the
 * admin app and a relative one from the community app, which is the whole
 * reason a hardcoded <tag>.cobuntu.com broke preview on custom domains.
 */

export interface EventManageHeaderProps {
  breadcrumbs: Array<{ label: string; onClick?: () => void }>;
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel: string;
  onPreview: () => void;
  previewLabel: string;
}

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
  </svg>
);

export function EventManageHeader({
  breadcrumbs,
  title,
  subtitle,
  onBack,
  backLabel,
  onPreview,
  previewLabel,
}: EventManageHeaderProps) {
  return (
    <div className="mb-8">
      {/* Chevron separators and zinc-400 links — the admin app's treatment,
          which is now everyone's. */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2 text-[13px] mb-5">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              {crumb.onClick ? (
                <button onClick={crumb.onClick} className="text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer">
                  {crumb.label}
                </button>
              ) : (
                <span className="text-zinc-700 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/*
        * ON A PHONE THE TITLE GETS THE ROW TO ITSELF.
        *
        * Back and Preview sat beside it at every width, so an event name of any
        * real length was truncated to make room for two controls that are not
        * what you came to read. The actions drop below and go full-width, which
        * also puts them in thumb reach instead of the top corner. The product
        * page's twin.
        */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl shrink-0 flex items-center justify-center bg-zinc-100 text-zinc-500">
            <CalendarIcon />
          </div>
          <div className="flex-1 min-w-0">
            {/* Wraps on a phone; truncates from md up, where the actions return
                to this row and the space is genuinely contested. */}
            <h1 className="text-xl font-semibold text-zinc-900 md:truncate">{title}</h1>
            {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 md:shrink-0 md:ml-auto [&>*]:flex-1 md:[&>*]:flex-none">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 cursor-pointer"
            title={backLabel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {backLabel}
          </button>
          <button
            onClick={onPreview}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {previewLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
