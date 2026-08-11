"use client";

import { StyledMap } from "../../ui/styled-map";

interface Props {
  event: any;
  brandColor?: string | null;
}

export function EventLocationMap({ event, brandColor }: Props) {
  const location = event?.physicalLocation;
  const lat = event?.physicalLatitude;
  const lng = event?.physicalLongitude;

  if (!location && !lat) return null;

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <h3 className="text-sm font-semibold text-zinc-900">Location</h3>
      </div>
      <StyledMap lat={lat} lng={lng} address={location} brandColor={brandColor} className="w-full h-[200px]" />
      {location && (
        <div className="px-6 py-3 border-t border-zinc-100 flex items-center justify-between">
          <p className="text-sm text-zinc-500">{location}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-medium text-zinc-900 hover:underline shrink-0"
          >
            Open in Maps
          </a>
        </div>
      )}
    </div>
  );
}
