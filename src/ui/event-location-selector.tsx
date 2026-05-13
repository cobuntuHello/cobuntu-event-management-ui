"use client";

import React, { useState, useEffect, useRef } from "react";
import { MapPin, Building2, Video, Link as LinkIcon, X, Check, ChevronRight, Search } from "lucide-react";
import { Input } from "./input";
import { cn } from "./utils";
import {
  searchLocations,
  getLocationDetails,
  isValidUrl,
  isVideoConferencingUrl,
  isGoogleMapsConfigured,
  type LocationSuggestion,
} from "../lib/google-maps";

interface EventLocationSelectorProps {
  physicalLocation: string;
  onlineUrl: string;
  onPhysicalLocationChange: (location: string) => void;
  onOnlineUrlChange: (url: string) => void;
  onCoordinatesChange?: (lat: number | null, lng: number | null) => void;
  className?: string;
  disabled?: boolean;
  hideHeader?: boolean;
}

export function EventLocationSelector({
  physicalLocation, onlineUrl, onPhysicalLocationChange, onOnlineUrlChange,
  onCoordinatesChange, className, disabled = false, hideHeader = false,
}: EventLocationSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(hideHeader);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [isValidOnline, setIsValidOnline] = useState(false);
  const [isVideoConf, setIsVideoConf] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const locationInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced location search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (physicalLocation.trim() && isGoogleMapsConfigured()) {
      debounceRef.current = setTimeout(async () => {
        setIsLoadingLocations(true);
        try {
          const suggestions = await searchLocations(physicalLocation);
          setLocationSuggestions(suggestions);
          setShowLocationSuggestions(true);
        } catch { setLocationSuggestions([]); }
        finally { setIsLoadingLocations(false); }
      }, 300);
    } else {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [physicalLocation]);

  // Validate online URL
  useEffect(() => {
    const valid = isValidUrl(onlineUrl);
    setIsValidOnline(valid);
    setIsVideoConf(valid ? isVideoConferencingUrl(onlineUrl) : false);
  }, [onlineUrl]);

  useEffect(() => { setSelectedSuggestionIndex(-1); }, [locationSuggestions]);

  const handleLocationSelect = async (suggestion: LocationSuggestion) => {
    try {
      const details = await getLocationDetails(suggestion.place_id);
      if (details) {
        onPhysicalLocationChange(details.formatted_address);
        onCoordinatesChange?.(details.geometry.location.lat, details.geometry.location.lng);
      } else {
        onPhysicalLocationChange(suggestion.description);
        onCoordinatesChange?.(null, null);
      }
    } catch {
      onPhysicalLocationChange(suggestion.description);
      onCoordinatesChange?.(null, null);
    }
    setShowLocationSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showLocationSuggestions || locationSuggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedSuggestionIndex(prev => prev < locationSuggestions.length - 1 ? prev + 1 : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : locationSuggestions.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (selectedSuggestionIndex >= 0) handleLocationSelect(locationSuggestions[selectedSuggestionIndex]); }
    else if (e.key === "Escape") { setShowLocationSuggestions(false); setSelectedSuggestionIndex(-1); }
  };

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) setShowLocationSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasPhysical = physicalLocation.trim() !== "";
  const hasOnline = onlineUrl.trim() !== "";
  const showContent = hideHeader || isExpanded;

  return (
    <div className={cn("", className)}>
      {!hideHeader && (
        <button type="button" onClick={() => !disabled && setIsExpanded(!isExpanded)} disabled={disabled}
          className={cn("w-full flex items-center justify-between text-sm font-medium text-zinc-800 transition-colors p-4", !disabled && "cursor-pointer", disabled && "opacity-50")}>
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /><span>Event Location</span></div>
            <span className="text-xs text-zinc-400 ml-6">
              {hasPhysical && hasOnline ? "Both physical and online locations set" : hasPhysical ? "Physical location set" : hasOnline ? "Online location set" : "Add physical location and/or online link"}
            </span>
          </div>
          <ChevronRight className={cn("h-4 w-4 text-zinc-400 transition-transform", isExpanded && "rotate-90")} />
        </button>
      )}

      <div className={cn("transition-all duration-300 ease-in-out", showContent ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0 overflow-hidden")}>
        <div className="space-y-6 px-4 pt-4 pb-4">
          {/* Physical Location */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-800">Physical Location</span>
            </div>
            <div className="relative">
              <Input ref={locationInputRef} type="text" value={physicalLocation}
                onChange={e => { onPhysicalLocationChange(e.target.value); if (!e.target.value) onCoordinatesChange?.(null, null); setSelectedSuggestionIndex(-1); }}
                onKeyDown={handleKeyDown}
                placeholder="Search for a location or enter address..." className="w-full pr-8" disabled={disabled} />
              {hasPhysical && !disabled && (
                <button type="button" onClick={() => { onPhysicalLocationChange(""); onCoordinatesChange?.(null, null); setShowLocationSuggestions(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              )}
              {isLoadingLocations && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400" />
                </div>
              )}
              {showLocationSuggestions && locationSuggestions.length > 0 && (
                <div ref={suggestionsRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {locationSuggestions.map((suggestion, index) => (
                    <button key={suggestion.place_id} onClick={() => handleLocationSelect(suggestion)}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      className={cn("w-full px-4 py-3 text-left transition-colors border-b border-zinc-100 last:border-b-0 cursor-pointer",
                        index === selectedSuggestionIndex ? "bg-zinc-900 text-white" : "hover:bg-zinc-50")}>
                      <div className="flex items-center gap-3">
                        <MapPin className={cn("h-4 w-4 flex-shrink-0", index === selectedSuggestionIndex ? "text-white" : "text-zinc-400")} />
                        <div className="flex-1 min-w-0">
                          <div className={cn("font-medium text-sm truncate", index === selectedSuggestionIndex ? "text-white" : "text-zinc-800")}>{suggestion.main_text}</div>
                          <div className={cn("text-xs truncate", index === selectedSuggestionIndex ? "text-zinc-300" : "text-zinc-400")}>{suggestion.secondary_text}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isGoogleMapsConfigured() && (
              <div className="text-xs text-zinc-500 flex items-center gap-1">
                <Search className="h-3 w-3" />
                <span>Google Maps API not configured. Manual entry only.</span>
              </div>
            )}
          </div>

          {/* Online URL */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-800">Online Event URL</span>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Input type="url" value={onlineUrl} onChange={e => onOnlineUrlChange(e.target.value)}
                  placeholder="https://zoom.us/j/... or https://meet.google.com/..." className="w-full pr-8" disabled={disabled} />
                {hasOnline && !disabled && (
                  <button type="button" onClick={() => onOnlineUrlChange("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {onlineUrl && (
                <div className="flex items-center gap-2 text-xs">
                  {isValidOnline ? (
                    <><Check className="h-3 w-3 text-green-600" /><span className="text-green-600">{isVideoConf ? "Valid video conferencing URL" : "Valid URL"}</span></>
                  ) : (
                    <><X className="h-3 w-3 text-red-600" /><span className="text-red-600">Invalid URL format</span></>
                  )}
                </div>
              )}
              <div className="flex items-start gap-2 text-xs text-zinc-400">
                <LinkIcon className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>Enter a valid URL for your online event (Zoom, Google Meet, Teams, etc.)</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
