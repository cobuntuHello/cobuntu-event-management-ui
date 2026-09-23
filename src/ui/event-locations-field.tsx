"use client";

import React, { useState, useEffect, useRef } from "react";
import { MapPin, Video, X, Plus, Search } from "lucide-react";
import { Input } from "./input";
import { cn } from "./utils";
import {
  searchLocations,
  getLocationDetails,
  isValidUrl,
  isGoogleMapsConfigured,
  type LocationSuggestion,
} from "../lib/google-maps";

/**
 * One location on the wire (Phase 2 event-locations). Mirrors the backend
 * EventLocationInput. A PHYSICAL row carries address (+ optional pin); an
 * ONLINE row carries url. Exactly one row is primary.
 */
export interface EventLocationValue {
  /** Stable key for React while editing; not sent to the server. */
  key: string;
  kind: "PHYSICAL" | "ONLINE";
  address: string;
  latitude: number | null;
  longitude: number | null;
  url: string;
  isPrimary: boolean;
}

let seq = 0;
const nextKey = () => `loc-${Date.now()}-${seq++}`;

export function makeLocation(kind: "PHYSICAL" | "ONLINE", isPrimary = false): EventLocationValue {
  return { key: nextKey(), kind, address: "", latitude: null, longitude: null, url: "", isPrimary };
}

/** Ensure exactly one primary — the current one, else the first row. */
function withOnePrimary(rows: EventLocationValue[]): EventLocationValue[] {
  if (rows.length === 0) return rows;
  let idx = rows.findIndex((r) => r.isPrimary);
  if (idx === -1) idx = 0;
  return rows.map((r, i) => ({ ...r, isPrimary: i === idx }));
}

interface Props {
  value: EventLocationValue[];
  onChange: (next: EventLocationValue[]) => void;
  disabled?: boolean;
}

/**
 * Repeatable location editor: any number of physical and/or online locations,
 * with one marked primary (the one cards/emails feature). Physical rows get
 * Google Places autocomplete; online rows a validated URL field.
 */
export function EventLocationsField({ value, onChange, disabled = false }: Props) {
  const rows = value;

  const update = (key: string, patch: Partial<EventLocationValue>) =>
    onChange(withOnePrimary(rows.map((r) => (r.key === key ? { ...r, ...patch } : r))));

  const add = (kind: "PHYSICAL" | "ONLINE") =>
    onChange(withOnePrimary([...rows, makeLocation(kind, rows.length === 0)]));

  const remove = (key: string) =>
    onChange(withOnePrimary(rows.filter((r) => r.key !== key)));

  const setPrimary = (key: string) =>
    onChange(rows.map((r) => ({ ...r, isPrimary: r.key === key })));

  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <p className="text-[13px] text-zinc-500">No location yet. Add a place or an online link.</p>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <LocationRow
            key={row.key}
            row={row}
            disabled={disabled}
            canRemove={rows.length > 0}
            showPrimary={rows.length > 1}
            onPatch={(patch) => update(row.key, patch)}
            onRemove={() => remove(row.key)}
            onMakePrimary={() => setPrimary(row.key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={() => add("PHYSICAL")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200 cursor-pointer disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Add place
        </button>
        <button type="button" disabled={disabled} onClick={() => add("ONLINE")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200 cursor-pointer disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Add online link
        </button>
      </div>

      {!isGoogleMapsConfigured() && (
        <div className="text-xs text-zinc-500 flex items-center gap-1">
          <Search className="h-3 w-3" />
          <span>Google Maps not configured — addresses are manual, without a map pin.</span>
        </div>
      )}
    </div>
  );
}

function LocationRow({
  row, disabled, canRemove, showPrimary, onPatch, onRemove, onMakePrimary,
}: {
  row: EventLocationValue;
  disabled: boolean;
  canRemove: boolean;
  showPrimary: boolean;
  onPatch: (patch: Partial<EventLocationValue>) => void;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  const isPhysical = row.kind === "PHYSICAL";
  return (
    <div className="rounded-xl ring-1 ring-zinc-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
          {isPhysical ? <MapPin className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
          {isPhysical ? "In person" : "Online"}
        </span>
        <div className="flex items-center gap-2">
          {showPrimary && (
            <button type="button" onClick={onMakePrimary} disabled={disabled}
              className={cn("text-[12px] font-medium rounded-full px-2 py-0.5 transition-colors cursor-pointer",
                row.isPrimary ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")}>
              {row.isPrimary ? "Primary" : "Make primary"}
            </button>
          )}
          {canRemove && (
            <button type="button" aria-label="Remove location" onClick={onRemove} disabled={disabled}
              className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-zinc-100 transition-colors cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isPhysical ? (
        <PhysicalInput row={row} disabled={disabled} onPatch={onPatch} />
      ) : (
        <OnlineInput row={row} disabled={disabled} onPatch={onPatch} />
      )}
    </div>
  );
}

function PhysicalInput({ row, disabled, onPatch }: { row: EventLocationValue; disabled: boolean; onPatch: (p: Partial<EventLocationValue>) => void }) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (row.address.trim() && isGoogleMapsConfigured()) {
      debounce.current = setTimeout(async () => {
        setLoading(true);
        try {
          setSuggestions(await searchLocations(row.address));
          setOpen(true);
        } catch { setSuggestions([]); }
        finally { setLoading(false); }
      }, 300);
    } else { setSuggestions([]); setOpen(false); }
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [row.address]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = async (s: LocationSuggestion) => {
    try {
      const d = await getLocationDetails(s.place_id);
      if (d) onPatch({ address: d.formatted_address, latitude: d.geometry.location.lat, longitude: d.geometry.location.lng });
      else onPatch({ address: s.description, latitude: null, longitude: null });
    } catch { onPatch({ address: s.description, latitude: null, longitude: null }); }
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <Input type="text" value={row.address} disabled={disabled}
        placeholder="Search for a place or enter an address..."
        // Any hand-edit drops the pin — it's only valid for the picked address.
        onChange={(e) => onPatch({ address: e.target.value, latitude: null, longitude: null })}
        className="w-full pr-8" />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400" /></div>}
      {row.latitude != null && row.longitude != null && (
        <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-zinc-400"><MapPin className="h-3 w-3" /> Pinned on the map</span>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <button key={s.place_id} type="button" onClick={() => pick(s)}
              className="w-full px-4 py-3 text-left transition-colors border-b border-zinc-100 last:border-b-0 cursor-pointer hover:bg-zinc-50">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 flex-shrink-0 text-zinc-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate text-zinc-800">{s.main_text}</div>
                  <div className="text-xs truncate text-zinc-400">{s.secondary_text}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OnlineInput({ row, disabled, onPatch }: { row: EventLocationValue; disabled: boolean; onPatch: (p: Partial<EventLocationValue>) => void }) {
  const valid = !row.url || isValidUrl(row.url);
  return (
    <div>
      <Input type="url" value={row.url} disabled={disabled}
        placeholder="https://zoom.us/j/... or https://meet.google.com/..."
        onChange={(e) => onPatch({ url: e.target.value })} className="w-full" />
      {row.url && !valid && <p className="mt-1 text-[12px] text-red-600">Invalid URL format</p>}
    </div>
  );
}
