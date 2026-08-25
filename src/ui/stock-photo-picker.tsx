"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Input } from "./input";
import { Loader2, Search, Image as ImageIcon } from "lucide-react";

interface UnsplashPhoto {
  id: string;
  urls: { regular: string; thumb: string; full: string };
  alt_description?: string;
  user: { name: string };
}

interface StockPhotoPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (imageUrl: string) => void;
}

const UNSPLASH_API_URL = "https://api.unsplash.com";

export function StockPhotoPicker({ open, onOpenChange, onSelect }: StockPhotoPickerProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [photos, setPhotos] = React.useState<UnsplashPhoto[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const UNSPLASH_ACCESS_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY || "";
  const hasApiKey = !!UNSPLASH_ACCESS_KEY;

  const searchPhotos = React.useCallback(async (query: string) => {
    if (!hasApiKey) { setError("API key not configured"); setPhotos([]); setIsLoading(false); return; }
    try {
      setIsLoading(true);
      setError(null);
      const url = query.trim()
        ? `${UNSPLASH_API_URL}/search/photos?query=${encodeURIComponent(query)}&per_page=20&client_id=${UNSPLASH_ACCESS_KEY}`
        : `${UNSPLASH_API_URL}/photos/random?count=20&client_id=${UNSPLASH_ACCESS_KEY}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch photos");
      const data = await res.json();
      setPhotos(query.trim() ? (data.results || []) : (Array.isArray(data) ? data : [data]));
    } catch {
      setError("Failed to load photos. Please try again.");
      setPhotos([]);
    } finally { setIsLoading(false); }
  }, [UNSPLASH_ACCESS_KEY, hasApiKey]);

  React.useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchPhotos(searchQuery), 500);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery, searchPhotos]);

  React.useEffect(() => { if (open) searchPhotos(""); }, [open, searchPhotos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose Stock Photo</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col flex-1 min-h-0 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input type="text" placeholder="Search for photos..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {!hasApiKey ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ImageIcon className="h-12 w-12 text-zinc-400 mb-4" />
                {/*
                  * WRITTEN FOR THE PERSON LOOKING AT IT.
                  *
                  * This said "Stock photos require API configuration" and told
                  * them to add NEXT_PUBLIC_UNSPLASH_ACCESS_KEY to their .env
                  * file. The person reading it is a community leader picking a
                  * picture for an event. They have no .env file, cannot act on
                  * it, and now know an internal variable name.
                  *
                  * It also read as broken rather than unavailable, which sent
                  * them looking for a fault instead of at the upload button
                  * two inches away -- the thing that still works.
                  */}
                <p className="mb-2 text-sm text-zinc-500">Stock photos aren&apos;t available right now</p>
                <p className="text-xs text-zinc-400">
                  You can still upload your own image.
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12"><p className="text-sm text-zinc-500">{error}</p></div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12"><ImageIcon className="h-12 w-12 text-zinc-400 mb-4" /><p className="text-sm text-zinc-500">No photos found</p></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map(photo => (
                  <button key={photo.id} type="button" onClick={() => { onSelect(photo.urls.full); onOpenChange(false); }}
                    className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 hover:border-zinc-400 transition-colors group cursor-pointer">
                    <img src={photo.urls.thumb} alt={photo.alt_description || "Stock photo"} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
          {hasApiKey && photos.length > 0 && (
            <div className="pt-4 border-t border-zinc-100">
              <p className="text-xs text-zinc-400 text-center">
                Powered by <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:underline font-medium">Unsplash</a>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
