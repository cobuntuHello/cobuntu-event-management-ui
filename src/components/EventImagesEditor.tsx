"use client";

import { MediaManager, type FramedPhoto, type ManagedMedia } from "@cobuntu/management-ui-shared";
import { MAX_EVENT_IMAGES, type EventImageRules, type UploadEventImage } from "../lib/eventImages";

/**
 * AN EVENT'S IMAGES: the cover first, then a square gallery (backend
 * docs/features/event-gallery.md), on the shared MediaManager
 * (@cobuntu/management-ui-shared) that products and courses use too: one
 * wide drop area, an upload modal with drag and drop, each photo framed
 * square after the choice, then reorder by drag, re-frame, replace, make
 * cover or remove.
 *
 * What this wrapper adds is the event's side:
 *   - each framed photo is UPLOADED at once (`upload`, POST .../event-images),
 *     with the community's tick, and the hosted URL is what the save sends;
 *   - the community's image rules (eventImageRules) become the manager's:
 *     the notice, the tick, the size floor, refusing AI-labelled files;
 *   - WITHOUT `upload` (a host app that has not wired the route) it is the
 *     single inline cover it always was: one photo, kept as a data URL in
 *     `bannerUrl`, so no consumer breaks by upgrading.
 */

export interface EventImage {
  /** Hosted URL, or a data URL in single-cover mode or while uploading. */
  url: string;
  /** The uncropped original, kept in memory so a photo added now re-frames from it. */
  source?: string;
  uploading?: boolean;
  /** Stable React key. */
  key: string;
}

let nextKey = 0;
export const imageKey = () => `img-${++nextKey}`;

export function EventImagesEditor({
  images, onChange, rules, upload, disabled,
}: {
  images: EventImage[];
  onChange: (next: EventImage[]) => void;
  rules?: EventImageRules | null;
  upload?: UploadEventImage;
  disabled?: boolean;
  /** Kept for callers of 0.106; the shared manager has no stock photos. */
  allowStockPhotos?: boolean;
}) {
  const items: ManagedMedia[] = images.map((i) => ({ id: i.key, preview: i.url, type: "image", source: i.source, uploading: i.uploading }));

  async function commit(photo: FramedPhoto): Promise<ManagedMedia> {
    if (!upload) return { id: imageKey(), preview: photo.dataUrl, type: "image", source: photo.source };
    const up = await upload(photo.dataUrl, { confirmed: photo.confirmed });
    return { id: imageKey(), preview: up.url, type: "image", source: photo.source };
  }

  return (
    <MediaManager
      items={items}
      onChange={(next) => onChange(next.map((m) => ({ key: m.id, url: m.preview, source: m.source, uploading: m.uploading })))}
      aspect={1}
      maxItems={upload ? MAX_EVENT_IMAGES : 1}
      commit={commit}
      rules={upload && rules ? rules : null}
      disabled={disabled}
    />
  );
}
