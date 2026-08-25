"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Input } from "./input";
import { Loader2, Search, Image as ImageIcon } from "lucide-react";
import {
  UNSPLASH_URL,
  fetchStockPhotos,
  notifyDownload,
  photographerUrl,
  type UnsplashPhoto,
} from "@cobuntu/management-ui-shared";
import { getEventManagementConfig } from "../config";

interface StockPhotoPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (imageUrl: string) => void;
}

/**
 * Auth for the proxy, without requiring a provider.
 *
 * `getEventManagementConfig()` THROWS when no provider has rendered, and this
 * picker is reached from the banner crop modal, which is used in flows that do
 * not all wrap themselves in one. Throwing here would take out the whole
 * dialog over a header.
 *
 * Returning {} is the correct fallback rather than a degraded one: the two host
 * apps authenticate differently. The admin holds a token in localStorage and
 * needs the Authorization header this returns; the community app uses an
 * httpOnly cookie that the browser attaches on its own and that JavaScript
 * cannot read. The proxy accepts either, so cookie-auth hosts work with no
 * header at all.
 */
function safeAuthHeaders(): Record<string, string> {
  try {
    return getEventManagementConfig().authHeaders();
  } catch {
    return {};
  }
}

type Status = "loading" | "ok" | "unconfigured" | "error";

export function StockPhotoPicker({ open, onOpenChange, onSelect }: StockPhotoPickerProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [photos, setPhotos] = React.useState<UnsplashPhoto[]>([]);
  const [status, setStatus] = React.useState<Status>("loading");

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    /*
     * No debounce on an empty query, 500ms on a typed one.
     *
     * This used to run TWO effects -- one on open, one on the debounce -- so
     * every open of the picker spent two requests instead of one. That was
     * invisible against an unlimited key and is not against Unsplash's Demo
     * tier of 50 requests/hour, shared across every user of the app.
     */
    const delay = searchQuery.trim() ? 500 : 0;
    const timer = setTimeout(async () => {
      setStatus("loading");
      const result = await fetchStockPhotos(searchQuery, {
        headers: safeAuthHeaders(),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setStatus(result.status);
      setPhotos(result.status === "ok" ? result.photos : []);
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, searchQuery]);

  function choose(photo: UnsplashPhoto) {
    // Unsplash requires this ping when a photo is actually used; it is what
    // credits the photographer with a download. Fire-and-forget by design.
    notifyDownload(photo, { headers: safeAuthHeaders() });
    onSelect(photo.urls.full);
    onOpenChange(false);
  }

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
            {status === "unconfigured" ? (
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
            ) : status === "error" ? (
              <div className="flex flex-col items-center justify-center py-12"><p className="text-sm text-zinc-500">Failed to load photos. Please try again.</p></div>
            ) : status === "loading" ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12"><ImageIcon className="h-12 w-12 text-zinc-400 mb-4" /><p className="text-sm text-zinc-500">No photos found</p></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map(photo => (
                  /*
                    * The credit sits OUTSIDE the button on purpose. Unsplash
                    * requires the photographer's name to link to their profile,
                    * and an anchor nested inside a button is invalid markup that
                    * browsers resolve inconsistently -- the link would sometimes
                    * pick the photo instead of opening the profile.
                    */
                  <div key={photo.id} className="flex flex-col gap-1">
                    <button type="button" onClick={() => choose(photo)}
                      className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 hover:border-zinc-400 transition-colors group cursor-pointer">
                      <img src={photo.urls.thumb} alt={photo.alt_description || "Stock photo"} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    </button>
                    <p className="text-[10px] text-zinc-400 truncate">
                      <a href={photographerUrl(photo)} target="_blank" rel="noopener noreferrer"
                        className="hover:underline hover:text-zinc-600">
                        {photo.user?.name || "Unsplash"}
                      </a>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {status === "ok" && photos.length > 0 && (
            <div className="pt-4 border-t border-zinc-100">
              <p className="text-xs text-zinc-400 text-center">
                Powered by <a href={UNSPLASH_URL} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:underline font-medium">Unsplash</a>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
