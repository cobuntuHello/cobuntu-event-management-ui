import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { EventImagesEditor, type EventImage } from "../components/EventImagesEditor";
import type { EventImageRules } from "../lib/eventImages";

/*
 * The event image editor (backend docs/features/event-gallery.md): cover
 * first, then a square gallery when the host wired an upload, the single
 * inline cover when it did not, and a community's rules before anything is
 * uploaded.
 */

vi.mock("react-easy-crop", () => ({
  default: (props: any) => <div data-testid="cropper" data-image={props.image} />,
}));

const TEJA: EventImageRules = {
  minEdge: 1080,
  requireConfirmation: true,
  confirmationText: "I hold the rights to these images, and none is AI-generated.",
  notice: "High-resolution photos only, at least 1080 × 1080 after cropping.",
  blockAiLabelled: true,
};

const img = (n: number): EventImage => ({ url: `https://storage.example/${n}.jpg`, key: `k${n}` });
const upload = vi.fn(async () => ({ url: "https://storage.example/new.jpg", width: 1200, height: 1200 }));

function Harness(props: { initial: EventImage[]; rules?: EventImageRules | null; withUpload?: boolean; onChange?: (n: EventImage[]) => void }) {
  const [images, setImages] = React.useState(props.initial);
  return (
    <EventImagesEditor
      images={images}
      onChange={(n) => { setImages(n); props.onChange?.(n); }}
      rules={props.rules}
      upload={props.withUpload === false ? undefined : upload}
    />
  );
}

describe("EventImagesEditor", () => {
  it("without an upload route it is the single cover it always was", () => {
    render(<Harness initial={[]} withUpload={false} rules={TEJA} />);
    expect(screen.getByText("Add banner")).toBeTruthy();
    // No gallery, so no tick and no notice: those belong to the upload route.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(TEJA.notice!)).toBeNull();
  });

  it("with a community's rules: shows the notice, and adding waits for the tick", () => {
    render(<Harness initial={[]} rules={TEJA} />);
    expect(screen.getByText(TEJA.notice!)).toBeTruthy();
    const add = screen.getByRole("button", { name: /Add banner/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText("Tick the box above first")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: TEJA.confirmationText }));
    expect(add.disabled).toBe(false);
  });

  it("the first image is the cover, and the arrows move a photo", () => {
    const onChange = vi.fn();
    render(<Harness initial={[img(1), img(2), img(3)]} onChange={onChange} />);
    expect(screen.getAllByText("Cover")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Move later" })[0]);
    expect(onChange.mock.calls.at(-1)![0].map((i: EventImage) => i.key)).toEqual(["k2", "k1", "k3"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove banner" })[2]);
    expect(onChange.mock.calls.at(-1)![0].map((i: EventImage) => i.key)).toEqual(["k2", "k1"]);
    expect(screen.getByText("2 of 8")).toBeTruthy();
  });

  it("stops at eight", () => {
    render(<Harness initial={[1, 2, 3, 4, 5, 6, 7, 8].map(img)} />);
    expect(screen.queryByRole("button", { name: /Add photo/ })).toBeNull();
  });

  it("refuses a file an AI tool labelled, before the cropper opens", async () => {
    const { container } = render(<Harness initial={[img(1)]} rules={{ ...TEJA, requireConfirmation: false }} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const ai = new File([new TextEncoder().encode("\xff\xd8 trainedAlgorithmicMedia")], "ai.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [ai] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/made with AI/));
    expect(screen.queryByTestId("cropper")).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});
