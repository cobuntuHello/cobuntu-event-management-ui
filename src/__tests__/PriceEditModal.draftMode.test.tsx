import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";
import { blankTier, blankDonation } from "../components/PriceEditModal/helpers";

/**
 * draftMode pins the contract used by admin's create-event form:
 * the modal renders entirely against parent-owned state, fires no
 * fetches, and hands the validated drafts back via onDraftCommit
 * when the user clicks Save. The parent (e.g. EventForm) holds the
 * drafts in its own form state and POSTs them as part of the
 * create-event payload.
 */

const baseProps = (overrides: any = {}) => ({
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  draftMode: true,
  onDraftCommit: vi.fn(),
  ...overrides,
});

describe("PriceEditModal — draftMode", () => {
  it("does NOT fetch /tiers, /stripe, or /segments on mount", async () => {
    const fetchFn = mockFetch([]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // A single blank tier is rendered as the only L1 row.
    await screen.findByRole("button", { name: /Standard/ });

    // No backend call fired during mount.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("seeds drafts from initialDraftTiers when provided", async () => {
    mockFetch([]);
    const initial = [
      { ...blankTier(), name: "VIP", price: "50" },
      { ...blankTier("EUR", 2), name: "GA", price: "20" },
    ];
    renderWithConfig(
      <PriceEditModal {...baseProps()} initialDraftTiers={initial} />,
    );

    // Both rows rendered in L1.
    await screen.findByRole("button", { name: /VIP/ });
    expect(screen.getByRole("button", { name: /GA/ })).toBeInTheDocument();
  });

  it("on Save: calls onDraftCommit with the current drafts + donation, then onSaved", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{ ...blankTier(), name: "GA", price: "10" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /GA/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
    const payload = props.onDraftCommit.mock.calls[0][0];
    expect(payload.tiers).toHaveLength(1);
    expect(payload.tiers[0]).toMatchObject({ name: "GA", price: "10" });
    expect(payload.donation).toBeDefined();
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("on validation failure: surfaces error via showToast, does NOT call onDraftCommit", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{ ...blankTier(), name: "", price: "10" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    // Wait for L1 row (Unnamed tier).
    await screen.findByRole("button", { name: /Unnamed tier/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(props.showToast).toHaveBeenCalledWith(
        expect.stringMatching(/Tier name is required/i),
      ),
    );
    expect(props.onDraftCommit).not.toHaveBeenCalled();
  });

  it("notify-attendees prompt never fires in draftMode (no original tiers)", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{ ...blankTier(), name: "GA", price: "10" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /GA/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // No prompt — Save went straight through.
    expect(screen.queryByText(/update ticket pricing\?/i)).not.toBeInTheDocument();
    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
  });

  it("seeds donation from initialDraftDonation when provided", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    const seededDonation = { ...blankDonation(), enabled: true, mode: "fixed" as const, amounts: ["5", "10", "25"] };
    const props = baseProps({
      initialDraftTiers: [{ ...blankTier(), name: "GA", price: "10" }],
      initialDraftDonation: seededDonation,
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /GA/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
    const payload = props.onDraftCommit.mock.calls[0][0];
    expect(payload.donation.enabled).toBe(true);
    expect(payload.donation.amounts).toEqual(["5", "10", "25"]);
  });
});
