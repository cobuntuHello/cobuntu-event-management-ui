import { describe, it, expect, vi, type Mock } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareModal, type RenderShareQr } from "../components/ShareModal";
import { EventActionsBar } from "../page/sections/EventActionsBar";
import { renderWithConfig } from "./test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const event = { id: "evt-1", slug: "summer-mixer", name: "Summer Mixer" };
const URL_SHARED = "https://orbis.cobuntu.com/events/summer-mixer";

/** Stands in for the app's QR row: shows what it was handed. */
const qrSlot = (): Mock<RenderShareQr> =>
  vi.fn<RenderShareQr>(({ url, name }) => <div data-testid="qr-row">{`${name} | ${url}`}</div>);

describe("ShareModal QR code row", () => {
  it("has no QR row when the host app passes none (the admin app)", () => {
    renderWithConfig(<ShareModal event={event} communityTag="orbis" onClose={vi.fn()} />);
    expect(screen.queryByTestId("qr-row")).toBeNull();
  });

  it("hands the slot exactly the link the modal shares and copies, the name and the event", () => {
    const renderQr = qrSlot();
    renderWithConfig(<ShareModal event={event} communityTag="orbis" onClose={vi.fn()} renderQr={renderQr} />);
    expect(renderQr).toHaveBeenCalledWith({ url: URL_SHARED, name: "Summer Mixer", event });
    expect(screen.getByTestId("qr-row")).toHaveTextContent(`Summer Mixer | ${URL_SHARED}`);
    // The copy row shows the same link the code carries.
    expect(screen.getByText(URL_SHARED)).toBeInTheDocument();
  });

  it("uses the id when the event has no slug, like the copy row", () => {
    const renderQr = qrSlot();
    renderWithConfig(
      <ShareModal event={{ id: "evt-1", name: "X" }} communityTag="orbis" onClose={vi.fn()} renderQr={renderQr} />,
    );
    expect(renderQr.mock.calls[0][0].url).toBe("https://orbis.cobuntu.com/events/evt-1");
  });

  // T-409: the code leads, under the event's name, as on the profile sheet.
  it("sits under the event's name and above Share via and the copy-link row", () => {
    renderWithConfig(<ShareModal event={event} communityTag="orbis" onClose={vi.fn()} renderQr={qrSlot()} />);
    const qr = screen.getByTestId("qr-row");
    const title = screen.getByText("Summer Mixer");
    const linkedIn = screen.getByRole("link", { name: /linkedin/i });
    const copyRow = screen.getByText(URL_SHARED);
    expect(title.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(qr.compareDocumentPosition(linkedIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(qr.compareDocumentPosition(copyRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the manage page threads renderShareQr to the Share modal", () => {
  const bar = (renderShareQr?: RenderShareQr) => (
    <EventActionsBar
      event={{ ...event, communities: [{ communityTag: "orbis", status: "ACTIVE", isHidden: false }] }}
      communityTag="orbis"
      isPublished
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      showToast={vi.fn()}
      renderShareQr={renderShareQr}
    />
  );

  it("Share Event opens the modal with the host app's QR row", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => null }) as any;
    const user = userEvent.setup();
    const renderQr = qrSlot();
    renderWithConfig(bar(renderQr));
    expect(screen.queryByTestId("qr-row")).toBeNull();
    await user.click(screen.getByRole("button", { name: /share event/i }));
    expect(await screen.findByTestId("qr-row")).toHaveTextContent(URL_SHARED);
    expect(renderQr.mock.calls[0][0]).toMatchObject({ url: URL_SHARED, name: "Summer Mixer" });
  });

  it("without the slot the modal opens with no QR row", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => null }) as any;
    const user = userEvent.setup();
    renderWithConfig(bar());
    await user.click(screen.getByRole("button", { name: /share event/i }));
    expect(await screen.findByText(URL_SHARED)).toBeInTheDocument();
    expect(screen.queryByTestId("qr-row")).toBeNull();
  });

  it("EventManagePage passes its renderShareQr prop to the bar", () => {
    const page = readFileSync(resolve(__dirname, "../page/EventManagePage.tsx"), "utf8");
    const barTag = page.slice(page.indexOf("<EventActionsBar"), page.indexOf("<SectionsNav"));
    expect(barTag).toContain("renderShareQr={renderShareQr}");
  });
});
