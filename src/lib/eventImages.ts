/**
 * An event's images: the cover plus a square gallery, and the rules a
 * community can set for them (backend docs/features/event-gallery.md).
 *
 * The cover is the first image and stays the event's `bannerUrl`; the rest
 * travel as `media`, in order. Every image is square: the cropper is locked
 * to 1:1, as event images always were.
 *
 * A community's rules live in its storefront config (`eventImageRules`).
 * TEJÁ House sets them: at least 1080 × 1080 after cropping, a tick per
 * upload ("I hold the rights to these images, and none is AI-generated"),
 * and files an AI tool labelled are refused.
 */

export const MAX_EVENT_IMAGES = 8;

export interface EventImageRules {
  /** Pixels, the SHORT side of the cropped image. Null = no floor. */
  minEdge: number | null;
  requireConfirmation: boolean;
  confirmationText: string;
  /** Shown by the upload. */
  notice: string | null;
  /** Refuse files whose own metadata says an AI tool made them. */
  blockAiLabelled: boolean;
}

/** What the upload route hands back for one image. */
export interface UploadedEventImage {
  url: string;
  width: number;
  height: number;
  fileSize?: number;
  mimeType?: string;
}

/** Upload one cropped image (a data URL); `confirmed` is the tick. */
export type UploadEventImage = (image: string, opts: { confirmed: boolean }) => Promise<UploadedEventImage>;

const DEFAULT_CONFIRMATION_TEXT = "I hold the rights to these images, and none is AI-generated.";

/**
 * A community's rules from its storefront config, or null when it sets none.
 * SYNC: mirrors readEventImageRules in the backend's
 * services/core/src/shared/utils/eventImageRules.ts (tolerant read, 2000 cap).
 */
export function readEventImageRules(storefrontConfig: unknown): EventImageRules | null {
  if (!storefrontConfig || typeof storefrontConfig !== "object") return null;
  const raw = (storefrontConfig as Record<string, unknown>).eventImageRules;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const minEdge = typeof r.minEdge === "number" && Number.isFinite(r.minEdge) && r.minEdge > 0
    ? Math.min(Math.round(r.minEdge), 2000)
    : null;
  const rules: EventImageRules = {
    minEdge,
    requireConfirmation: r.requireConfirmation === true,
    confirmationText: typeof r.confirmationText === "string" && r.confirmationText.trim()
      ? r.confirmationText.trim()
      : DEFAULT_CONFIRMATION_TEXT,
    notice: typeof r.notice === "string" && r.notice.trim() ? r.notice.trim() : null,
    blockAiLabelled: r.blockAiLabelled === true,
  };
  if (!rules.minEdge && !rules.requireConfirmation && !rules.notice && !rules.blockAiLabelled) return null;
  return rules;
}

/** Is a cropped image of this size big enough? Measures the short side. */
export function meetsMinEdge(rules: EventImageRules | null | undefined, width: number, height: number): boolean {
  if (!rules?.minEdge) return true;
  return Math.min(width, height) >= rules.minEdge;
}

/*
 * THE AI LABEL. Tools that generate images increasingly say so inside the
 * file, in the IPTC "digital source type" vocabulary, written either as XMP
 * (Midjourney, Adobe Firefly, Google) or inside a C2PA Content Credentials
 * manifest (OpenAI, Adobe). Both spell the value with the same IPTC term, so
 * a plain byte search for it finds either, with no parser:
 *
 *   trainedAlgorithmicMedia               made by a generative model
 *   compositeWithTrainedAlgorithmicMedia  a photo with generated parts
 *
 * It must run on the ORIGINAL file: the cropper redraws the picture on a
 * canvas, which drops all metadata, so the server never sees the label. And
 * it only catches files that still carry it: a screenshot or a re-save loses
 * it. That is why the rules also ask for a tick, and why TEJÁ still reviews
 * every request; this check is a first filter, not a detector.
 */
const AI_TERMS = ["trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia"];

/** Does this file's own metadata say an AI tool made it? */
export function hasAiGeneratedLabel(bytes: Uint8Array): boolean {
  // latin1 maps every byte to one character, so offsets line up and any
  // ASCII term in the bytes appears verbatim in the string.
  let text = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return AI_TERMS.some((term) => text.includes(term));
}

/** The same check for a picked file. Metadata sits near the start, but C2PA can trail; the whole file is read. */
export async function fileHasAiGeneratedLabel(file: Blob): Promise<boolean> {
  // Blob.arrayBuffer is missing in older Safari and in jsdom; FileReader is everywhere.
  const buf: ArrayBuffer = typeof file.arrayBuffer === "function"
    ? await file.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  return hasAiGeneratedLabel(new Uint8Array(buf));
}

/** Pixel size of an image (a data URL or a URL). */
export function imageSizeOf(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("image could not be read"));
    img.src = src;
  });
}
