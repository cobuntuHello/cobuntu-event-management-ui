import { describe, it, expect } from "vitest";
import { fileHasAiGeneratedLabel, hasAiGeneratedLabel, meetsMinEdge, readEventImageRules } from "../lib/eventImages";

/*
 * An event's images and a community's rules for them (backend
 * docs/features/event-gallery.md): reading the rules from a storefront
 * config, the size floor on the cropped image, and the AI label check that
 * has to run on the original file.
 */

const TEJA = {
  minEdge: 1080,
  requireConfirmation: true,
  confirmationText: "I hold the rights to these images, and none is AI-generated.",
  notice: "High-resolution photos only.",
  blockAiLabelled: true,
};

const bytes = (...parts: Array<string | number[]>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

describe("readEventImageRules", () => {
  it("reads TEJÁ's rules and reads nothing as no rules", () => {
    expect(readEventImageRules({ eventImageRules: TEJA })).toEqual(TEJA);
    expect(readEventImageRules({})).toBeNull();
    expect(readEventImageRules(null)).toBeNull();
    expect(readEventImageRules({ eventImageRules: { requireConfirmation: false } })).toBeNull();
  });

  it("caps the floor at what the cropper can export", () => {
    expect(readEventImageRules({ eventImageRules: { minEdge: 4000 } })?.minEdge).toBe(2000);
  });
});

describe("meetsMinEdge", () => {
  it("measures the short side of the cropped image", () => {
    const rules = readEventImageRules({ eventImageRules: TEJA });
    expect(meetsMinEdge(rules, 1080, 1080)).toBe(true);
    expect(meetsMinEdge(rules, 2000, 1000)).toBe(false);
    expect(meetsMinEdge(null, 10, 10)).toBe(true);
  });
});

describe("the AI label", () => {
  const JPEG_START = [0xff, 0xd8, 0xff, 0xe1];

  it("finds the IPTC term in XMP, the way Midjourney and Firefly write it", () => {
    const xmp = '<rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>';
    expect(hasAiGeneratedLabel(bytes(JPEG_START, xmp, [0xff, 0xd9]))).toBe(true);
  });

  it("finds a photo with generated parts, inside a C2PA manifest", () => {
    expect(hasAiGeneratedLabel(bytes(JPEG_START, "jumb", [0, 1, 2], "c2pa.actions", [0x78], "compositeWithTrainedAlgorithmicMedia"))).toBe(true);
  });

  it("passes a plain photo, and one that only has Content Credentials from a camera", () => {
    expect(hasAiGeneratedLabel(bytes(JPEG_START, "Exif", [0, 0], "Canon EOS R6", [0xff, 0xd9]))).toBe(false);
    expect(hasAiGeneratedLabel(bytes(JPEG_START, "jumb", "c2pa.actions", "digitalCapture"))).toBe(false);
  });

  it("reads a picked file", async () => {
    const file = new File([bytes(JPEG_START, "trainedAlgorithmicMedia")], "ai.jpg", { type: "image/jpeg" });
    expect(await fileHasAiGeneratedLabel(file)).toBe(true);
    const plain = new File([bytes(JPEG_START, "Exif")], "photo.jpg", { type: "image/jpeg" });
    expect(await fileHasAiGeneratedLabel(plain)).toBe(false);
  });
});
