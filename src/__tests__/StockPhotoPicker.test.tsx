import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StockPhotoPicker } from "../ui/stock-photo-picker";

/**
 * StockPhotoPicker — the Unsplash surface.
 *
 * What's pinned here is what Unsplash's API Guidelines require and what a
 * refactor can silently drop:
 *  • the photographer is credited, and the credit LINKS to them with the
 *    referral params (a credit without them does not count as attribution);
 *  • picking a photo pings the download endpoint, which is what credits the
 *    photographer and is checked during Production review;
 *  • the key never reaches this component — it asks a same-origin proxy;
 *  • a deployment with no key says so calmly instead of looking broken;
 *  • opening the picker spends ONE request, not two. Invisible on an
 *    unlimited key, decisive against the Demo tier's 50/hour.
 */

const { fetchStockPhotos, notifyDownload } = vi.hoisted(() => ({
  fetchStockPhotos: vi.fn(),
  notifyDownload: vi.fn(),
}));

vi.mock("@cobuntu/management-ui-shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cobuntu/management-ui-shared")>();
  return { ...actual, fetchStockPhotos, notifyDownload };
});

const photo = {
  id: "abc",
  urls: { regular: "r.jpg", thumb: "t.jpg", full: "f.jpg" },
  alt_description: "a field",
  user: { name: "Ansel", username: "ansel", links: { html: "https://unsplash.com/@ansel" } },
  links: { download_location: "https://api.unsplash.com/photos/abc/download" },
};

beforeEach(() => {
  fetchStockPhotos.mockReset();
  notifyDownload.mockReset();
  fetchStockPhotos.mockResolvedValue({ status: "ok", photos: [photo] });
});

function open(onSelect = vi.fn()) {
  render(<StockPhotoPicker open onOpenChange={vi.fn()} onSelect={onSelect} />);
  return onSelect;
}

describe("attribution", () => {
  it("credits the photographer by name", async () => {
    open();
    expect(await screen.findByText("Ansel")).toBeInTheDocument();
  });

  it("links the credit to the photographer with the referral params", async () => {
    open();
    const link = await screen.findByRole("link", { name: "Ansel" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/@ansel"));
    expect(link).toHaveAttribute("href", expect.stringContaining("utm_source=cobuntu"));
    expect(link).toHaveAttribute("href", expect.stringContaining("utm_medium=referral"));
  });

  it("credits Unsplash itself with referral params too", async () => {
    open();
    const link = await screen.findByRole("link", { name: "Unsplash" });
    expect(link).toHaveAttribute("href", expect.stringContaining("utm_medium=referral"));
  });

  it("keeps the credit link outside the photo button, so it stays clickable", async () => {
    open();
    const link = await screen.findByRole("link", { name: "Ansel" });
    expect(link.closest("button")).toBeNull();
  });
});

describe("choosing a photo", () => {
  it("pings the download endpoint, which is what credits the photographer", async () => {
    const onSelect = open();
    const tile = await screen.findByRole("button", { name: /a field/i });
    await userEvent.click(tile);
    expect(notifyDownload).toHaveBeenCalledOnce();
    expect(notifyDownload.mock.calls[0][0]).toMatchObject({ id: "abc" });
    expect(onSelect).toHaveBeenCalledWith("f.jpg");
  });
});

describe("the request", () => {
  it("spends one request per open, not two", async () => {
    open();
    await screen.findByText("Ansel");
    await waitFor(() => expect(fetchStockPhotos).toHaveBeenCalledTimes(1));
  });

  it("does not fetch while closed", () => {
    render(<StockPhotoPicker open={false} onOpenChange={vi.fn()} onSelect={vi.fn()} />);
    expect(fetchStockPhotos).not.toHaveBeenCalled();
  });
});

describe("when the deployment has no key", () => {
  it("says stock photos are unavailable rather than looking broken", async () => {
    fetchStockPhotos.mockResolvedValue({ status: "unconfigured" });
    open();
    expect(await screen.findByText(/aren't available right now/i)).toBeInTheDocument();
  });

  it("points at the upload button that still works", async () => {
    fetchStockPhotos.mockResolvedValue({ status: "unconfigured" });
    open();
    expect(await screen.findByText(/still upload your own image/i)).toBeInTheDocument();
  });

  it("never names an environment variable at the person picking a picture", async () => {
    fetchStockPhotos.mockResolvedValue({ status: "unconfigured" });
    const { container } = render(
      <StockPhotoPicker open onOpenChange={vi.fn()} onSelect={vi.fn()} />,
    );
    await screen.findByText(/aren't available right now/i);
    expect(container.textContent).not.toMatch(/UNSPLASH_ACCESS_KEY|\.env/i);
  });
});
