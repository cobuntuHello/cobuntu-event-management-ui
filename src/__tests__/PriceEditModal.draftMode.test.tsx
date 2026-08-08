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

/**
 * Reported 2026-08-08 on the product create form: "the Save button does nothing or at
 * least gives no visual feedback."
 *
 * The cause was not the Save handler — it correctly refused a tier with no
 * price and raised "Price required". It was that EventForm passed a console.warn, so the modal's only error channel was a stub. The
 * message was produced and discarded, the modal stayed open unchanged, and
 * Save looked dead.
 *
 * These assert what a user can SEE, with showToast deliberately a no-op — the
 * exact wiring the event create form uses. A test that asserted showToast was called
 * would have passed throughout the entire time the bug was live.
 */
describe("PriceEditModal — draftMode save failures are visible without a host toast", () => {
  it("renders the validation failure inside the modal", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    // An explicitly invalid draft (no name) rather than relying on whatever a
    // blank tier happens to default to — that default differs between the two
    // packages and would make this test quietly stop testing anything.
    const props = baseProps({
      showToast: () => {},
      initialDraftTiers: [{ ...blankTier(), name: "", price: "10" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await user.click(await screen.findByRole("button", { name: /^save$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/tier name is required/i);
    expect(props.onDraftCommit).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("clears a previous failure once the user fixes it", async () => {
    // Otherwise the banner becomes a permanent scold that outlives the problem.
    // Named tier with no price — the exact state in the 2026-08-08 report.
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      showToast: () => {},
      initialDraftTiers: [{ ...blankTier(), name: "Standard", price: "" }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await user.click(await screen.findByRole("button", { name: /^save$/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/price required/i);

    // The price field lives inside the tier (L2), not on the L1 list.
    await user.click(screen.getByRole("button", { name: /Standard/ }));
    await user.type(await screen.findByPlaceholderText("0.00"), "25");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * Registration form on an UNSAVED tier.
 *
 * Reported 2026-08-08: "the form picker is disabled and says I must save
 * first — this is the free default price tier that is always on display on
 * the form either way. Why can't I add a form already?"
 *
 * It was disabled because a form is keyed on tierId and a draft tier has none.
 * The backend now takes the form inline on the create payload, so in draftMode
 * the builder edits t.draftForm and it ships with the tier. These pin the two
 * halves that could regress independently: the row being reachable at all, and
 * what the builder does with no tier to PUT against.
 */
describe("PriceEditModal — draftMode registration form", () => {
  it("the Registration form row is reachable on an unsaved tier", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));

    const row = await screen.findByRole("button", { name: /Registration form/i });
    expect(row).not.toBeDisabled();
    // The old copy told the user to go away; it must not come back.
    expect(row.textContent).not.toMatch(/save first/i);
    expect(row.textContent).toMatch(/none/i);
  });

  it("reports the staged field count, not the server's", async () => {
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{
        ...blankTier(),
        name: "Standard",
        price: "10",
        // hasForm/formFieldCount describe a SAVED tier's server copy and must
        // not be consulted for a draft — reading them here would show 0.
        draftForm: { fields: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
      }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));

    const row = await screen.findByRole("button", { name: /Registration form/i });
    expect(row.textContent).toMatch(/2 fields/i);
  });

  it("fires no request when opening the builder on a draft tier", async () => {
    // The whole point: there is no tier to GET a form from. A stray call would
    // 404 against a tierId that does not exist.
    const fetchFn = mockFetch([]);
    const user = userEvent.setup();
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /Standard/ }));
    await user.click(await screen.findByRole("button", { name: /Registration form/i }));

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("carries the staged form out through onDraftCommit", async () => {
    // End to end for this layer: what the parent receives is what the create
    // payload sends.
    mockFetch([]);
    const user = userEvent.setup();
    const props = baseProps({
      initialDraftTiers: [{
        ...blankTier(),
        name: "Standard",
        price: "10",
        draftForm: { fields: [{ id: "a", label: "Your name" }] },
      }],
    });
    renderWithConfig(<PriceEditModal {...props} />);

    await screen.findByRole("button", { name: /Standard/ });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onDraftCommit).toHaveBeenCalled());
    const committed = props.onDraftCommit.mock.calls[0][0];
    expect(committed.tiers[0].draftForm.fields).toHaveLength(1);
  });
});
