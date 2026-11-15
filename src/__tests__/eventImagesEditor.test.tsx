import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";

/*
 * The event image editor (backend docs/features/event-gallery.md) is the
 * shared MediaManager (@cobuntu/management-ui-shared, tested there) with the
 * event's side: square frames, up to 8, each framed photo uploaded at once
 * with the community's tick, the community's rules, and the single inline
 * cover when the host wired no upload. The manager is stubbed to record what
 * it is given and to hand back one framed photo.
 */

let last: any = null;
vi.mock("@cobuntu/management-ui-shared", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    MediaManager: (p: any) => {
      last = p;
      return (
        <div>
          <span data-testid="count">{p.items.length}</span>
          <button type="button" onClick={async () => {
            const item = await p.commit({ dataUrl: "data:image/jpeg;base64,FRAMED", file: new File(["x"], "p.jpg"), width: 1200, height: 1200, source: "data:image/png;base64,ORIG", confirmed: true });
            p.onChange([...p.items, item]);
          }}>frame one</button>
        </div>
      );
    },
  };
});

import { EventImagesEditor, type EventImage } from "../components/EventImagesEditor";
import type { EventImageRules } from "../lib/eventImages";

const TEJA: EventImageRules = {
  minEdge: 1080,
  requireConfirmation: true,
  confirmationText: "I hold the rights to these images, and none is AI-generated.",
  notice: "High-resolution photos only.",
  blockAiLabelled: true,
};

function Harness(props: { initial?: EventImage[]; rules?: EventImageRules | null; upload?: any; onChange?: (n: EventImage[]) => void }) {
  const [images, setImages] = React.useState<EventImage[]>(props.initial ?? []);
  return <EventImagesEditor images={images} onChange={(n) => { setImages(n); props.onChange?.(n); }} rules={props.rules} upload={props.upload} />;
}

describe("EventImagesEditor", () => {
  it("gives the shared manager a square frame, up to 8, and the community's rules", () => {
    render(<Harness rules={TEJA} upload={vi.fn()} />);
    expect(last.aspect).toBe(1);
    expect(last.maxItems).toBe(8);
    expect(last.rules).toEqual(TEJA);
  });

  it("uploads each framed photo with the tick and keeps the hosted URL", async () => {
    const upload = vi.fn(async () => ({ url: "https://s/event-images/1.jpg", width: 1200, height: 1200 }));
    const onChange = vi.fn();
    render(<Harness rules={TEJA} upload={upload} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "frame one" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledWith("data:image/jpeg;base64,FRAMED", { confirmed: true });
    expect(onChange.mock.calls.at(-1)![0][0]).toMatchObject({ url: "https://s/event-images/1.jpg", source: "data:image/png;base64,ORIG" });
  });

  it("without an upload route it is the single inline cover it always was", async () => {
    const onChange = vi.fn();
    render(<Harness rules={TEJA} onChange={onChange} />);
    expect(last.maxItems).toBe(1);
    // No upload route, no gallery, so no rules: those belong to the route.
    expect(last.rules).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "frame one" }));
    await waitFor(() => expect(onChange.mock.calls.at(-1)![0][0].url).toBe("data:image/jpeg;base64,FRAMED"));
  });

  it("hands existing photos over in order, the cover first", () => {
    render(<Harness upload={vi.fn()} initial={[{ url: "https://s/a.jpg", key: "a" }, { url: "https://s/b.jpg", key: "b" }]} />);
    expect(last.items.map((i: any) => i.preview)).toEqual(["https://s/a.jpg", "https://s/b.jpg"]);
  });
});
