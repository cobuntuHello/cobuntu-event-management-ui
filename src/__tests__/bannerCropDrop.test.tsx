import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { BannerCropModal } from "../ui/banner-crop-modal";

/**
 * Dropping a photo onto the frame.
 *
 * Asked for by a host who designs a cover elsewhere, downloads it, and still
 * has the Downloads folder open: dragging it across beats searching for the
 * filename in a file dialog again. The picker still works; this is a second
 * way in, through the same handler.
 */

// The real cropper draws to a canvas jsdom has no 2d context for. The mock
// reports the image it was handed, which is what these tests are about.
vi.mock("react-easy-crop", () => ({
  default: (props: any) => <div data-testid="cropper" data-image={props.image} />,
}));

const INITIAL = "data:image/png;base64,AAAA";

/** Opens straight on the crop view, which is where the drop target lives. */
const renderCrop = () =>
  render(
    <BannerCropModal
      open
      onOpenChange={() => {}}
      onSave={() => {}}
      title="Event Image"
      directCropSrc={INITIAL}
    />,
  );

/* Fired on the cropper: drop and dragover BUBBLE, so this exercises the real
   listener on the body without the test having to know where it sits. */
const surface = () => screen.getByTestId("cropper");
const shownImage = () => screen.getByTestId("cropper").getAttribute("data-image");

const drop = (file: File) =>
  fireEvent.drop(surface(), { dataTransfer: { files: [file] } });

describe("dropping an image onto the crop frame", () => {
  it("loads a dropped image, without the file dialog", async () => {
    renderCrop();
    expect(shownImage()).toBe(INITIAL);

    drop(new File(["binary"], "Luma format_Pathseekers content (4).png", { type: "image/png" }));

    // FileReader is async: the dropped photo replaces the one on screen.
    await waitFor(() => expect(shownImage()).not.toBe(INITIAL));
    expect(shownImage()).toMatch(/^data:image\/png/);
  });

  it("ignores a dropped file that is not an image", async () => {
    // A drop can carry a PDF, a folder, or a dragged link. Reading one would
    // hand the cropper a data URL it cannot draw: a blank square, no reason
    // given, and the photo they had already chosen gone.
    renderCrop();

    drop(new File(["%PDF"], "deck.pdf", { type: "application/pdf" }));

    await new Promise((r) => setTimeout(r, 20));
    expect(shownImage()).toBe(INITIAL);
  });

  it("prevents default on dragover, or the browser navigates to the file", () => {
    // Without preventDefault the BROWSER handles the drop: it opens the image
    // as a page, and the half-finished event goes with it.
    renderCrop();

    const evt = new Event("dragover", { bubbles: true, cancelable: true });
    surface().dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
  });

  it("says the frame takes a drop, since the target is invisible until used", () => {
    renderCrop();
    expect(screen.getByText(/drop a new one in/)).toBeInTheDocument();
  });

  it("acknowledges the drag while it is over the frame", () => {
    // The copy swaps rather than a tooltip appearing: the sentence is already
    // there, and changing it in place is what tells them to let go.
    renderCrop();

    fireEvent.dragOver(surface());

    expect(screen.getByText("Drop your image to use it")).toBeInTheDocument();
  });
});

/**
 * The screen Stella actually landed on.
 *
 * DetailsView opens this modal with `initialImageSrc`, not `directCropSrc`, so
 * it shows the Upload / Stock choices first. A drop target only on the cropper
 * would have missed the request entirely: the folder is open BEFORE a file has
 * been chosen, which is the whole point.
 */
describe("dropping onto the options screen", () => {
  const renderOptions = () =>
    render(
      <BannerCropModal
        open
        onOpenChange={() => {}}
        onSave={() => {}}
        title="Event Image"
        initialImageSrc="https://cdn.example/existing.png"
      />,
    );

  it("takes a drop where the photo is chosen, not only where it is cropped", async () => {
    renderOptions();
    const upload = screen.getByRole("button", { name: "Upload new image" });

    fireEvent.drop(upload, {
      dataTransfer: { files: [new File(["binary"], "cover.png", { type: "image/png" })] },
    });

    // Straight to the crop step, exactly as picking the file would have done.
    await waitFor(() => expect(screen.getByTestId("cropper")).toBeInTheDocument());
  });

  it("says so on the button while a file is over it", () => {
    renderOptions();
    const upload = screen.getByRole("button", { name: "Upload new image" });

    fireEvent.dragOver(upload);

    expect(screen.getByRole("button", { name: "Drop your image to use it" })).toBeInTheDocument();
  });
});
