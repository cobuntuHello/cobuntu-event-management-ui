"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { useEventT } from "../i18n";
import { useEventImageRules, useUpdateEvent, useUploadEventImage } from "../config";
import { EventImagesEditor, imageKey, type EventImage } from "./EventImagesEditor";

/**
 * AN EXISTING EVENT'S PHOTOS, from the manage page (backend
 * docs/features/event-gallery.md): the cover, then the square gallery, in the
 * same editor the create form uses. Each photo is cropped and uploaded as it
 * is added, under the community's image rules; Save writes the order (the
 * first is the cover). It replaced the cropper that set the cover alone.
 *
 * THE RULES come from useEventImageRules (the config's, else the API's).
 * Until they are known nothing can be added, so a photo is never checked
 * against "no rules" by mistake. Without an upload route (no apiBaseUrl and no
 * config.uploadEventImage) the editor is the single inline cover it always was.
 */
export function EventImagesDialog({
  open, onOpenChange, communityTag, event, onSaved, showToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityTag: string;
  event: { id: string; bannerUrl?: string | null; gallery?: Array<{ url: string }> | null };
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  // Cancel / Save / Saving… are the cover cropper's, already in every language.
  const tButtons = useEventT("eventsUi.manageUi.bannerCropModal");
  const tView = useEventT("eventsUi.manageUi.detailsView");
  const upload = useUploadEventImage(communityTag);
  const updateEvent = useUpdateEvent();
  const rules = useEventImageRules(communityTag);
  const [images, setImages] = useState<EventImage[]>([]);
  const [saving, setSaving] = useState(false);

  // Fresh from the event each time it opens, so a cancelled edit is gone.
  useEffect(() => {
    if (!open) return;
    setImages([
      ...(event.bannerUrl ? [{ url: event.bannerUrl, key: imageKey() }] : []),
      ...(event.gallery ?? []).map((g) => ({ url: g.url, key: imageKey() })),
    ]);
  }, [open, event.bannerUrl, event.gallery]);

  const uploading = images.some((i) => i.uploading);

  async function save() {
    setSaving(true);
    try {
      await updateEvent(communityTag, event.id, {
        bannerUrl: images[0]?.url ?? null,
        // Only with an upload route: without one there is no gallery to write.
        ...(upload ? { media: images.slice(1).map((i) => i.url) } : {}),
      });
      showToast(images.length ? tView("imageUpdated") : tView("imageRemoved"));
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      showToast(e?.message || tView("imageFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tView("imageTitle")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto py-1">
          <EventImagesEditor
            images={images}
            onChange={setImages}
            rules={rules ?? null}
            upload={upload}
            disabled={saving || rules === undefined}
            allowStockPhotos
          />
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-[13px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
          >
            {tButtons("cancel")}
          </button>
          <Button type="button" disabled={saving || uploading || rules === undefined} onClick={() => { void save(); }}>
            {saving ? tButtons("saving") : tButtons("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
