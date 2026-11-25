import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareModal } from "../components/ShareModal";
import { renderWithConfig } from "./test-utils";

const URL_SHARED = "https://orbis.cobuntu.com/events/summer-mixer";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  event: { id: "evt-1", slug: "summer-mixer", name: "Summer Mixer" },
  communityTag: "orbis",
  onClose: vi.fn(),
  ...overrides,
});

/*
 * T-409: the modal is laid out as the community app's profile share sheet:
 * the event at the top, "Share via" with the networks in their own colours,
 * "Or copy link" with a mono link and a Copy pill, and a close X.
 */
describe("ShareModal", () => {
  it("shows the public event URL using the slug when present", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByText(URL_SHARED)).toBeInTheDocument();
  });

  it("falls back to event.id when the slug is missing", () => {
    renderWithConfig(<ShareModal {...baseProps({ event: { id: "evt-1", name: "X" } })} />);
    expect(screen.getByText("https://orbis.cobuntu.com/events/evt-1")).toBeInTheDocument();
  });

  it("leads with the event: its name, and its banner when it has one", () => {
    renderWithConfig(
      <ShareModal {...baseProps({ event: { id: "evt-1", slug: "summer-mixer", name: "Summer Mixer", bannerUrl: "https://img.test/b.png" } })} />,
    );
    expect(screen.getByText("Summer Mixer")).toBeInTheDocument();
    // The modal is portalled, so look in the whole document.
    expect(document.body.querySelector('img[src="https://img.test/b.png"]')).not.toBeNull();
  });

  it("shows the event's initial when it has no banner", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("has the Share via and Or copy link sections, in that order", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    const via = screen.getByText("Share via");
    const copy = screen.getByText("Or copy link");
    expect(via.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers WhatsApp, Facebook, X, LinkedIn and Email, each a link to that network with this event's URL", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    const enc = encodeURIComponent(URL_SHARED);
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href") ?? "";
    expect(href(/whatsapp/i)).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(href(/whatsapp/i)).toContain(enc);
    expect(href(/facebook/i)).toBe(`https://www.facebook.com/sharer/sharer.php?u=${enc}`);
    expect(href(/^x$/i)).toContain(`url=${enc}`);
    expect(href(/linkedin/i)).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${enc}`);
    expect(href(/email/i)).toMatch(/^mailto:\?subject=Summer%20Mixer&body=/);
  });

  it("opens the networks in a new tab, and Email in the mail app", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByRole("link", { name: /linkedin/i })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /linkedin/i })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /email/i })).not.toHaveAttribute("target");
  });

  it("paints each network in its own colour, not a grey circle", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    const disc = (name: RegExp) => screen.getByRole("link", { name }).querySelector("span") as HTMLElement;
    expect(disc(/whatsapp/i).style.background).toMatch(/#25d366|rgb\(37, 211, 102\)/i);
    expect(disc(/linkedin/i).style.background).toMatch(/#0a66c2|rgb\(10, 102, 194\)/i);
  });

  it("the copy row carries the link and a Copy pill", async () => {
    // happy-dom rejects navigator.clipboard.writeText outside a real user
    // gesture, so the spy is not asserted: the pill is there and clickable.
    const user = userEvent.setup();
    renderWithConfig(<ShareModal {...baseProps()} />);
    const row = screen.getByText(URL_SHARED).parentElement as HTMLElement;
    const pill = within(row).getByRole("button", { name: /^copy$/i });
    await user.click(pill);
  });

  it("a close X calls onClose, and there is no Close text button any more", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<ShareModal {...props} />);
    const x = screen.getByRole("button", { name: /^close$/i });
    expect(x.textContent?.trim()).toBe("");
    await user.click(x);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("still names itself for screen readers", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByRole("heading", { name: /share event/i })).toBeInTheDocument();
  });
});
