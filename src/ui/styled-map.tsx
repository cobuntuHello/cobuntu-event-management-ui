/// <reference types="@types/google.maps" />
"use client";

import { useEffect, useRef } from "react";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function buildStyles(brandColor?: string): google.maps.MapTypeStyle[] {
  let waterColor = "#e8edf2";
  let landscapeColor = "#f8f8f8";

  if (brandColor) {
    const { h, s } = hexToHsl(brandColor);
    waterColor = hslToHex(h, Math.min(s, 25), 90);
    landscapeColor = hslToHex(h, Math.min(s, 10), 96);
  }

  return [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", stylers: [{ color: waterColor }] },
    { featureType: "landscape", stylers: [{ color: landscapeColor }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#b0b8c0" }] },
    { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
    { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#a0a8b0" }] },
    { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#e0e0e0" }] },
  ];
}

interface Props {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  brandColor?: string | null;
  className?: string;
}

export function StyledMap({ lat, lng, address, brandColor, className = "" }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!API_KEY || typeof window === "undefined") return;

    if (window.google?.maps) {
      initMap();
      return;
    }

    const existing = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existing) {
      existing.addEventListener("load", initMap);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, [lat, lng, address]);

  function initMap() {
    if (!mapRef.current || !window.google?.maps) return;

    const center = lat && lng
      ? { lat, lng }
      : { lat: 41.15, lng: -8.61 };

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(center);
      mapInstanceRef.current.setOptions({ styles: buildStyles(brandColor || undefined) });
      if (markerRef.current) markerRef.current.setPosition(center);
      return;
    }

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: buildStyles(brandColor || undefined),
    });

    markerRef.current = new google.maps.Marker({
      position: center,
      map: mapInstanceRef.current,
    });

    if (!lat && !lng && address) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          mapInstanceRef.current?.setCenter(loc);
          markerRef.current?.setPosition(loc);
        }
      });
    }
  }

  if (!API_KEY) {
    return (
      <div className={`flex items-center justify-center bg-zinc-50 ${className}`}>
        <p className="text-[11px] text-zinc-300">Map unavailable</p>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
}
