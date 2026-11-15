"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, X } from "lucide-react";
import { BannerCropModal, type BannerCropResult } from "../ui/banner-crop-modal";
import { useEventT } from "../i18n";
import {
  MAX_EVENT_IMAGES, fileHasAiGeneratedLabel, imageSizeOf, meetsMinEdge,
  type EventImageRules, type UploadEventImage,
} from "../lib/eventImages";

/**
 * AN EVENT'S IMAGES: the cover first, then a square gallery (backend
 * docs/features/event-gallery.md).
 *
 * Each photo is picked, cropped square (the same cropper the cover always
 * used) and uploaded on its own as soon as it is cropped, so the save only
 * carries URLs. The first image is the cover, which every card, share
 * preview and email shows; the arrows move a photo, so any of them can
 * become the cover.
 *
 * A COMMUNITY'S RULES (`rules`, from its storefront config's eventImageRules)
 * are applied before anything is uploaded, and the server applies them again:
 *   - an AI tool's own label in the ORIGINAL file refuses it (lib/eventImages:
 *     the crop drops the file's metadata, so this is the only place it can be
 *     seen);
 *   - the CROPPED image must reach `minEdge` on its short side: zooming into a
 *     big photo can still leave a small image, and that is what gets stored;
 *   - the tick must be ticked before a photo can be added, and travels with
 *     each upload, where the server records it.
 *
 * WITHOUT `upload` (a host app that has not wired the upload route yet) the
 * editor behaves as the single cover always did: one image, kept as a data
 * URL in `bannerUrl`, no gallery, so no consumer breaks by upgrading.
 */

export interface EventImage {
  /** Hosted URL, or a data URL in single-cover mode or while uploading. */
  url: string;
  /** The uncropped picture, kept in memory so a photo added now can be recropped. */
  source?: string;
  uploading?: boolean;
  /** Stable React key. */
  key: string;
}

let nextKey = 0;
export const imageKey = () => `img-${++nextKey}`;

export function EventImagesEditor({
  images, onChange, rules, upload, disabled, allowStockPhotos = false,
}: {
  images: EventImage[];
  onChange: (next: EventImage[]) => void;
  rules?: EventImageRules | null;
  upload?: UploadEventImage;
  disabled?: boolean;
  /**
   * Offer the cropper's own Upload / Stock photos screen when adding, as the
   * manage page's cover cropper always did. Ignored where the community
   * refuses AI-labelled files: that check has to see the original file,
   * which only the direct picker hands over.
   */
  allowStockPhotos?: boolean;
}) {
  const t = useEventT("eventsUi.manageUi.eventForm");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  /** Which image a crop replaces (a recrop), or null to add a new one. */
  const [cropTarget, setCropTarget] = useState<string | null>(null);
  // The latest list, for the async upload to write into without a stale closure.
  const latest = useRef(images);
  latest.current = images;

  const gallery = !!upload;
  const max = gallery ? MAX_EVENT_IMAGES : 1;
  const needsTick = !!rules?.requireConfirmation && gallery;
  const canAdd = !disabled && images.length < max && (!needsTick || confirmed);

  const stockMode = allowStockPhotos && !rules?.blockAiLabelled;

  function pick() {
    setError(null);
    if (!canAdd) return;
    setCropTarget(null);
    if (stockMode) {
      // The cropper opens on its Upload / Stock photos choice.
      setCropSrc(null);
      setCropOpen(true);
      return;
    }
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (rules?.blockAiLabelled && (await fileHasAiGeneratedLabel(file))) {
      setError(t("imageAiLabelled"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setCropSrc(reader.result as string); setCropOpen(true); };
    reader.readAsDataURL(file);
  }

  function recrop(img: EventImage) {
    if (disabled || !img.source) return;
    setError(null);
    setCropTarget(img.key);
    setCropSrc(img.source);
    setCropOpen(true);
  }

  async function onCropped(result: BannerCropResult) {
    const data = result.base64;
    if (!data) return;
    const source = cropSrc ?? undefined;
    if (rules?.minEdge) {
      const { width, height } = await imageSizeOf(data);
      if (!meetsMinEdge(rules, width, height)) {
        setError(t("imageTooSmall", { width, height, min: rules.minEdge }));
        return;
      }
    }

    if (!upload) {
      // Single-cover mode: the cropped image is the cover, sent inline.
      onChange([{ url: data, source, key: images[0]?.key ?? imageKey() }]);
      return;
    }

    const key = cropTarget ?? imageKey();
    const pending: EventImage = { url: data, source, uploading: true, key };
    onChange(cropTarget
      ? latest.current.map((i) => (i.key === key ? pending : i))
      : [...latest.current, pending]);
    try {
      const up = await upload(data, { confirmed: needsTick ? confirmed : false });
      onChange(latest.current.map((i) => (i.key === key ? { url: up.url, source, key } : i)));
    } catch (err) {
      onChange(latest.current.filter((i) => i.key !== key));
      setError(err instanceof Error && err.message ? err.message : t("imageUploadFailed"));
    }
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }

  function remove(key: string) {
    setError(null);
    onChange(images.filter((i) => i.key !== key));
  }

  return (
    <div className="space-y-3" data-event-images="">
      {rules?.notice && gallery && (
        <p className="rounded-xl bg-zinc-50 px-4 py-3 text-[12.5px] leading-snug text-zinc-600">{rules.notice}</p>
      )}

      {needsTick && (
        <label className="flex items-start gap-3 cursor-pointer text-[13px] text-zinc-700">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={disabled}
            onChange={(e) => { setConfirmed(e.target.checked); setError(null); }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 cursor-pointer accent-[var(--brand-color,#18181b)]"
          />
          <span>{rules!.confirmationText}</span>
        </label>
      )}

      <div className={gallery ? "grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-[560px]" : "max-w-[360px]"}>
        {images.map((img, i) => (
          <div key={img.key} className="group relative aspect-square rounded-2xl overflow-hidden ring-1 ring-zinc-100 bg-zinc-50">
            <button
              type="button"
              onClick={() => recrop(img)}
              disabled={disabled || !img.source || img.uploading}
              className="block w-full h-full cursor-pointer disabled:cursor-default"
              aria-label={img.source ? t("recropBanner") : t("bannerAlt")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={t("bannerAlt")} className={`w-full h-full object-cover ${img.uploading ? "opacity-60" : ""}`} />
            </button>
            {i === 0 && (
              <span className="pointer-events-none absolute top-2.5 left-2.5 text-[11px] font-semibold tracking-wide bg-white/85 backdrop-blur-sm text-zinc-800 px-2.5 py-1 rounded-full">{t("cover")}</span>
            )}
            {img.uploading ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-label={t("imageUploading")}>
                <Loader2 className="h-5 w-5 animate-spin text-white drop-shadow" />
              </span>
            ) : (
              <>
                <button type="button" onClick={() => remove(img.key)} disabled={disabled} aria-label={t("removeBanner")}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer">
                  <X className="h-3.5 w-3.5" />
                </button>
                {gallery && images.length > 1 && (
                  <div className="absolute bottom-2 right-2 flex gap-1.5">
                    <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={t("imageMoveEarlier")}
                      className="h-7 w-7 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-0">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === images.length - 1} aria-label={t("imageMoveLater")}
                      className="h-7 w-7 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-0">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {images.length < max && (
          <button type="button" onClick={pick} disabled={!canAdd}
            className="group relative w-full aspect-square rounded-2xl bg-zinc-50 border-2 border-dashed border-zinc-200 hover:border-zinc-300 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2.5 px-3 text-center text-zinc-400 hover:text-zinc-500 disabled:cursor-not-allowed disabled:hover:border-zinc-200">
            <span className="w-12 h-12 rounded-2xl bg-white ring-1 ring-zinc-100 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              <ImageIcon className="h-6 w-6 text-zinc-300" />
            </span>
            <span className="text-[13px] font-medium">{images.length === 0 ? t("addBanner") : t("addImage")}</span>
            <span className="text-[11px] text-zinc-300">
              {needsTick && !confirmed ? t("imageTickFirst") : images.length === 0 ? t("addBannerHint") : t("imageCount", { count: images.length, max })}
            </span>
          </button>
        )}
      </div>

      {gallery && images.length > 1 && <p className="text-[12px] text-zinc-400">{t("imageCoverHint")}</p>}
      {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <BannerCropModal
        open={cropOpen}
        onOpenChange={setCropOpen}
        directCropSrc={cropSrc}
        onSave={onCropped}
        title={t("framePhoto")}
        hideStockPhotos={!stockMode}
      />
    </div>
  );
}
