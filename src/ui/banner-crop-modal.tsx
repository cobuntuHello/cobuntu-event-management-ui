"use client";

import * as React from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Button } from "./button";
import { Slider } from "./slider";
import { StockPhotoPicker } from "./stock-photo-picker";
import { Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import { cn } from "./utils";
import { drawFitted, fitWithin, IMAGE_QUALITY } from "@cobuntu/management-ui-shared";

type CroppedAreaPixels = { width: number; height: number; x: number; y: number };

export interface BannerCropResult {
  base64: string | null;
}

interface BannerCropModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialImageSrc?: string | null;
  onSave: (result: BannerCropResult) => Promise<void> | void;
  title?: string;
  hideStockPhotos?: boolean;
  /**
   * When set, the modal opens STRAIGHT on the cropper with this image and
   * skips the upload/stock "options" step. Used by the event banner flow,
   * where the caller ran the device file picker itself (tap banner → native
   * picker → this cropper → done). No intermediate popup.
   */
  directCropSrc?: string | null;
}

export function BannerCropModal({
  open, onOpenChange, initialImageSrc = null, onSave, title = "Edit Banner", hideStockPhotos = false,
  directCropSrc = null,
}: BannerCropModalProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [stockPhotoOpen, setStockPhotoOpen] = React.useState(false);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<CroppedAreaPixels | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setStockPhotoOpen(false);
      if (directCropSrc) {
        // Caller handed us the image already — go straight to the cropper,
        // no upload/stock options step.
        setImageSrc(directCropSrc);
        setOptionsOpen(false);
      } else {
        setOptionsOpen(true);
        setImageSrc(null);
      }
    } else {
      setImageSrc(null);
      setOptionsOpen(false);
      setStockPhotoOpen(false);
    }
  }, [open, directCropSrc]);

  const triggerFilePicker = () => { requestAnimationFrame(() => fileInputRef.current?.click()); };

  const handleStockPhotoSelect = (imageUrl: string) => {
    setStockPhotoOpen(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Capped here as well as on the crop below: a stock photo can be larger
      // than anything a camera produces, and this is the copy the cropper then
      // works from, so leaving it full-size would put the pixels back.
      const ctx = drawFitted(canvas, img);
      if (ctx) { setImageSrc(canvas.toDataURL("image/jpeg", IMAGE_QUALITY)); setOptionsOpen(false); }
    };
    img.src = imageUrl;
  };

  /*
   * One path for a chosen file, whatever chose it. The picker and the drop
   * target both land here so they cannot drift — the reason the drop target
   * exists at all is that they are the same act.
   */
  const loadImageFile = (file: File | null | undefined) => {
    if (!file) return;
    // A drop can carry anything: a PDF, a folder, a dragged link. Reading a
    // non-image would set a data URL the cropper cannot draw, leaving a blank
    // square with no explanation.
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => { setImageSrc(reader.result as string); setOptionsOpen(false); };
    reader.readAsDataURL(file);
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadImageFile(file);
  };

  /*
   * Drop straight onto the frame.
   *
   * Asked for by a host who designs a cover elsewhere, downloads it, and still
   * has the Downloads folder open: dragging it over beats finding the filename
   * again in a file dialog.
   *
   * dragOver must preventDefault or the browser navigates away to the dropped
   * file and the half-finished event goes with it.
   */
  const [dragging, setDragging] = React.useState(false);

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    loadImageFile(e.dataTransfer?.files?.[0]);
  };

  const onCropComplete = React.useCallback((_: any, pixels: CroppedAreaPixels) => { setCroppedAreaPixels(pixels); }, []);

  const getCroppedBase64 = async (src: string, area: CroppedAreaPixels): Promise<string> => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (!src.startsWith("data:") && !src.startsWith("blob:")) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");
    const cropX = Math.max(0, Math.round(area.x));
    const cropY = Math.max(0, Math.round(area.y));
    const cropWidth = Math.min(Math.round(area.width), image.naturalWidth - cropX);
    const cropHeight = Math.min(Math.round(area.height), image.naturalHeight - cropY);
    /*
     * The cropped region, capped on its longest edge.
     *
     * This is the image that is actually uploaded -- the product form turns
     * this data URL straight back into the File it sends, and the event form
     * posts it as base64 inside the JSON body. It used to be written at the
     * SOURCE's resolution, so a 4000px photo cropped to a banner was still a
     * 4000px-wide banner.
     *
     * One drawImage does both jobs: the source rectangle is the crop, the
     * destination rectangle is the capped size, and the browser resamples
     * between them.
     */
    const out = fitWithin({ width: cropWidth, height: cropHeight });
    canvas.width = out.width;
    canvas.height = out.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, out.width, out.height);
    return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  };

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setIsSaving(true);
    try {
      const base64 = await getCroppedBase64(imageSrc, croppedAreaPixels);
      await onSave({ base64 });
      onOpenChange(false);
    } finally { setIsSaving(false); }
  };

  const handleClear = async () => {
    setImageSrc(null);
    setOptionsOpen(false);
    await onSave({ base64: null });
    onOpenChange(false);
  };

  const showCropModal = imageSrc !== null && !optionsOpen && !stockPhotoOpen;

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onSelectFile} />

      {/* Options Dialog */}
      <Dialog open={open && optionsOpen && !stockPhotoOpen && !showCropModal} onOpenChange={(o) => { setOptionsOpen(o); if (!o) onOpenChange(false); }}>
        <DialogContent className={cn("max-w-sm gap-0 p-0 rounded-3xl border-0 shadow-2xl overflow-hidden",
          "left-4 right-4 translate-x-0 sm:left-1/2 sm:right-auto sm:translate-x-[-50%]")}>
          <DialogHeader className="px-6 py-5 text-center">
            <DialogTitle className="text-base font-semibold text-center">{title}</DialogTitle>
          </DialogHeader>
          {/*
            * The drop target belongs HERE as much as on the cropper: this is the
            * screen where a photo gets chosen, and the request came from someone
            * whose Downloads folder was already open behind it. Dropping goes
            * straight to the crop step, exactly as picking does.
            */}
          <div
            className="flex flex-col gap-2 px-4 pb-4"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { if (!e.relatedTarget) setDragging(false); }}
            onDrop={onDropFile}
          >
            <button type="button" onClick={triggerFilePicker}
              className={cn(
                "flex min-h-[48px] items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-zinc-800 transition-colors cursor-pointer",
                dragging
                  ? "bg-zinc-50 border border-dashed border-zinc-900"
                  : "bg-zinc-100 hover:bg-zinc-200",
              )}>
              {dragging ? "Drop your image to use it" : "Upload new image"}
            </button>
            {!hideStockPhotos && (
              <button type="button" onClick={() => { setOptionsOpen(false); setStockPhotoOpen(true); }}
                className="flex min-h-[48px] items-center justify-center rounded-xl bg-zinc-100 px-6 py-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 cursor-pointer">
                <ImageIcon className="h-4 w-4 mr-2" />
                Add Stock Photo
              </button>
            )}
            {initialImageSrc && (
              <button type="button" onClick={handleClear} disabled={isSaving}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-red-50 px-6 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 cursor-pointer">
                <Trash2 className="h-4 w-4" />
                Remove image
              </button>
            )}
            <button type="button" onClick={() => { setOptionsOpen(false); onOpenChange(false); }}
              className="flex min-h-[48px] items-center justify-center rounded-xl px-6 py-3 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 cursor-pointer">
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Photo Picker */}
      <StockPhotoPicker open={stockPhotoOpen} onOpenChange={setStockPhotoOpen} onSelect={handleStockPhotoSelect} />

      {/* Crop Modal */}
      <Dialog open={open && showCropModal} onOpenChange={onOpenChange}>
        <DialogContent hideClose className="sm:max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 flex-shrink-0">
            <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
            {/* The drop target is invisible until something is dragged over it,
                so it has to be said once here or nobody discovers it. */}
            <p className="text-sm text-zinc-500 mt-1">
              {dragging
                ? "Drop your image to use it"
                : "Adjust the image to fit a square (1:1) format, or drop a new one in"}
            </p>
          </DialogHeader>

          <div
            className="px-6 py-4 space-y-6 overflow-y-auto flex-1 min-h-0"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            /*
             * relatedTarget null is the pointer leaving the WINDOW. Without
             * that check, dragging across a child element fires dragLeave on
             * the parent and the highlight flickers the whole way across.
             */
            onDragLeave={(e) => { if (!e.relatedTarget) setDragging(false); }}
            onDrop={onDropFile}
          >
            <div
              data-dragging={dragging || undefined}
              className={`relative w-full rounded-xl overflow-hidden bg-zinc-100 border aspect-square shadow-inner max-w-full transition-colors ${
                dragging ? "border-zinc-900 border-dashed bg-zinc-50" : "border-zinc-200"
              }`}
            >
              {imageSrc ? (
                /*
                 * restrictPosition (the default) keeps the image covering the
                 * crop box. It was explicitly disabled, which let the photo be
                 * dragged clear of the frame - so the square could sit partly
                 * OUTSIDE the image and the saved crop came back with blank
                 * edges. The feed's cropper never had this off.
                 *
                 * objectFit="cover" is the other half: the default "contain"
                 * letterboxes a non-square photo inside a 1:1 frame, which is
                 * why it opened off-centre with grey beside it. Cover fills
                 * the frame and centres, so the first thing you see is a valid
                 * crop you can nudge rather than one you must fix.
                 */
                <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} showGrid={false} cropShape="rect"
                  objectFit="cover"
                  onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-400">
                  <div className="text-center space-y-2">
                    <ImageIcon className="h-12 w-12 mx-auto opacity-50" />
                    <p className="text-sm">Select an image to start</p>
                  </div>
                </div>
              )}
            </div>

            {imageSrc && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    <ImageIcon className="h-4 w-4 text-zinc-400" />
                    <label className="text-sm font-medium text-zinc-800">Zoom</label>
                  </div>
                  {/* A real button, not a link. Same for Remove below: both
                    * DO something to the photo, so neither should read as
                    * navigation. */}
                  <Button type="button" variant="outline" size="sm" onClick={() => { setImageSrc(null); setOptionsOpen(true); }} className="text-xs">
                    Change Image
                  </Button>
                </div>
                {/*
                  * Floor of 100%, not 50%.
                  *
                  * This is not a cropper - nothing is clipped OUT of the photo.
                  * It is a framer: the photo always fills the square window and
                  * the user pans and zooms to choose which part shows. Under
                  * that rule the photo can never be smaller than the window.
                  *
                  * 50% broke exactly that. Below 100% the photo is SMALLER than
                  * the frame, so blank edges are unavoidable and restrictPosition
                  * has nothing left to clamp against - which is why the photo
                  * could still be dragged off the frame after restrictPosition
                  * was restored. The two bugs looked like one.
                  *
                  * AvatarEditor and the feed's MediaCropModal already sit at 1.
                  * These three banner framers were the outliers.
                  */}
                <Slider value={[zoom]} onValueChange={v => setZoom(v[0] || 1)} min={1} max={3} step={0.01} />
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>100%</span>
                  <span className="font-medium">{Math.round(zoom * 100)}%</span>
                  <span>300%</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-zinc-100 bg-zinc-50 gap-2 flex-shrink-0">
            {imageSrc && (
              <Button variant="outline" onClick={handleClear} disabled={isSaving}
                className="text-red-600 border-red-200 hover:text-red-700 hover:bg-red-50 hover:border-red-300 mr-auto">
                <Trash2 className="h-4 w-4 mr-2" /> Remove
              </Button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" onClick={() => { setImageSrc(null); setOptionsOpen(true); }} disabled={isSaving}>Cancel</Button>
              <Button onClick={handleSave} disabled={!imageSrc || !croppedAreaPixels || isSaving} className="min-w-[100px]">
                {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
