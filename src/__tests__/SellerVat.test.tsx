import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { VatSection } from "../components/PriceEditModal/VatSection";
import { blankTier, buildTierBody } from "../components/PriceEditModal/helpers";
import {
  vatRateFor,
  vatPreview,
  buyerPriceToSend,
  typedPriceFromStored,
  entersNet,
} from "../components/PriceEditModal/vat";
import {
  buildRowsFromOverrides,
  buildUpsertBody,
  memberPricePreview,
  rowIsDirty,
  type MemberPricingRow,
} from "../components/PriceEditModal/member-pricing";
import { MemberPricingSection } from "../components/MemberPricingSection";
import type { DraftTier, VatOptions } from "../components/PriceEditModal/types";
import { renderWithConfig } from "./test-utils";

/**
 * Seller VAT in the tier editor (backend docs/features/seller-vat.md).
 *
 * Impact Hub Porto: a €30 ticket with IVA 23% added on top. The server stores
 * what the buyer pays (€36.90); the host can type either number.
 */
const PT: VatOptions = {
  available: true,
  reason: null,
  reasonText: null,
  jurisdiction: { key: "PT", name: "Portugal", label: "IVA" },
  options: [
    { category: "STANDARD", rate: 23 },
    { category: "INTERMEDIATE", rate: 13 },
    { category: "REDUCED", rate: 6 },
    { category: "EXEMPT", rate: 0 },
  ],
};

const tier = (patch: Partial<DraftTier> = {}): DraftTier => ({ ...blankTier("EUR"), id: "t1", price: "30", ...patch });

describe("VAT arithmetic: prices are always before VAT", () => {
  it("sends the price exactly as typed", () => {
    expect(buyerPriceToSend(tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED" }), 23)).toBe(30);
    expect(buyerPriceToSend(tier(), null)).toBe(30);
  });

  it("shows a stored price back as it was stored", () => {
    expect(typedPriceFromStored(3000, "EUR")).toBe("30");
  });

  it("previews what buyers pay at checkout, rounded as the backend and Stripe round it", () => {
    expect(vatPreview(tier({ vatCategory: "STANDARD" }), 23)).toEqual({ gross: 3690, net: 3000, vat: 690 });
    expect(vatPreview(tier({ price: "10.02", vatCategory: "STANDARD" }), 23)).toEqual({ gross: 1232, net: 1002, vat: 230 });
  });

  it("labels the price as before VAT whenever VAT is added, pay-what-you-want included", () => {
    expect(entersNet(tier({ vatCategory: "STANDARD" }))).toBe(true);
    expect(entersNet(tier({ vatCategory: "STANDARD", priceMode: "pwyw" }))).toBe(true);
    expect(entersNet(tier({ vatCategory: "EXEMPT" }))).toBe(false);
    expect(entersNet(tier())).toBe(false);
  });

  it("finds the rate for a category only when VAT is available", () => {
    expect(vatRateFor(PT, "REDUCED")).toBe(6);
    expect(vatRateFor({ ...PT, available: false }, "REDUCED")).toBeNull();
    expect(vatRateFor(PT, null)).toBeNull();
  });
});

describe("buildTierBody", () => {
  it("sends the typed EUR30 and the VAT setting, never a VAT-inclusive price", () => {
    const body = buildTierBody(tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED" }), { vatRate: 23, vatChanged: true });
    expect(body).toMatchObject({ price: 30, vatCategory: "STANDARD", vatPriceEntry: "ADDED" });
  });

  it("leaves the VAT fields out when they did not change (an unrelated edit is never refused)", () => {
    const body = buildTierBody(tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED" }), { vatRate: 23, vatChanged: false });
    expect(body).not.toHaveProperty("vatCategory");
    expect(body).not.toHaveProperty("vatPriceEntry");
  });

  it("clears VAT explicitly", () => {
    const body = buildTierBody(tier({ vatCategory: null }), { vatRate: null, vatChanged: true });
    expect(body).toMatchObject({ vatCategory: null, vatPriceEntry: null });
  });
});

function Harness({ initial, options, onChange }: { initial: DraftTier; options: VatOptions | null | undefined; onChange?: (t: DraftTier) => void }) {
  const [t, setT] = useState(initial);
  return (
    <VatSection
      t={t}
      options={options}
      locked={false}
      onUpdate={(p) => setT((prev) => { const next = { ...prev, ...p }; onChange?.(next); return next; })}
    />
  );
}

describe("VatSection", () => {
  it("offers the Portuguese rates, keeps the typed price, and previews checkout", async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    renderWithConfig(<Harness initial={tier()} options={PT} onChange={changes} />);
    await user.click(screen.getByRole("radio", { name: /IVA 23%/ }));
    expect(screen.getByTestId("vat-preview").textContent).toMatch(/30[.,]00.*36[.,]90.*IVA 23%.*6[.,]90/);
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ vatCategory: "STANDARD", vatPriceEntry: "ADDED", price: "30" }));
  });

  it("no longer asks whether the price includes VAT", async () => {
    const user = userEvent.setup();
    renderWithConfig(<Harness initial={tier()} options={PT} />);
    await user.click(screen.getByRole("radio", { name: /IVA 23%/ }));
    expect(screen.queryByRole("radio", { name: /includes IVA|Add IVA/i })).toBeNull();
  });

  it("explains why VAT is unavailable instead of offering rates", () => {
    renderWithConfig(
      <Harness
        initial={tier()}
        options={{ available: false, reason: "SELLER_NOT_REGISTERED", reasonText: "Add your VAT number in your tax details to charge VAT.", jurisdiction: null, options: [] }}
      />,
    );
    expect(screen.getByText(/Add your VAT number/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("renders nothing while loading or where VAT is not offered", () => {
    const { container: a } = renderWithConfig(<Harness initial={tier()} options={undefined} />);
    expect(a.textContent).toBe("");
    const { container: b } = renderWithConfig(<Harness initial={tier()} options={null} />);
    expect(b.textContent).toBe("");
  });

  it("removing VAT keeps the typed price and clears the setting", async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    renderWithConfig(<Harness initial={tier({ price: "30", vatCategory: "STANDARD", vatPriceEntry: "ADDED" })} options={PT} onChange={changes} />);
    await user.click(screen.getByRole("radio", { name: "No VAT" }));
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ vatCategory: null, price: "30" }));
  });
});

/**
 * Member amounts are before VAT like every price, and the row says what the
 * member pays at checkout. Same arithmetic as the backend (finances
 * seller-vat-checkout.test.ts: EUR30 less 20% is EUR24, plus EUR5.52).
 */
describe("member prices on a ticket with VAT", () => {
  const row = (patch: Partial<MemberPricingRow> = {}): MemberPricingRow => ({
    segmentId: "s1", segmentName: "Circle", enabled: true, mode: "FIXED_PRICE", value: "20", priority: "0", ...patch,
  });
  const withVat = tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED" });
  const segments = [{ id: "s1", name: "Circle" }];

  it("sends amounts exactly as typed", () => {
    expect(buildUpsertBody(row(), "EUR").value).toBe(2000);
    expect(buildUpsertBody(row({ mode: "FLAT_OFF", value: "5" }), "EUR").value).toBe(500);
    expect(buildUpsertBody(row({ mode: "PERCENT_OFF", value: "20" }), "EUR").value).toBe(20);
  });

  it("shows a stored amount back as stored", () => {
    const rows = buildRowsFromOverrides(segments, [{ segmentId: "s1", mode: "FIXED_PRICE", value: 2000 }], "EUR");
    expect(rows[0].value).toBe("20");
    expect(rowIsDirty(rows[0])).toBe(false);
  });

  it("previews each discount: off the price before VAT, then VAT added", () => {
    expect(memberPricePreview(row(), withVat, 23)).toEqual({ gross: 2460, net: 2000, vat: 460 });
    expect(memberPricePreview(row({ mode: "FLAT_OFF", value: "5" }), withVat, 23)).toEqual({ gross: 3075, net: 2500, vat: 575 });
    expect(memberPricePreview(row({ mode: "PERCENT_OFF", value: "20" }), withVat, 23)).toEqual({ gross: 2952, net: 2400, vat: 552 });
    expect(memberPricePreview(row({ mode: "FREE", value: "" }), withVat, 23)).toEqual({ gross: 0, net: 0, vat: 0 });
  });

  it("previews nothing it cannot be sure of", () => {
    expect(memberPricePreview(row(), tier(), null)).toBeNull();
    expect(memberPricePreview(row({ value: "" }), withVat, 23)).toBeNull();
    expect(memberPricePreview(row({ enabled: false }), withVat, 23)).toBeNull();
    expect(memberPricePreview(row(), tier({ vatCategory: "STANDARD", priceMode: "pwyw" }), 23)).toBeNull();
    expect(memberPricePreview(row(), tier({ vatCategory: "EXEMPT" }), 0)).toBeNull();
  });

  it("tells the host the amount is before VAT and what the member pays", () => {
    renderWithConfig(
      <MemberPricingSection
        state={{ loading: false, error: null, rows: [row()] }}
        onRowChange={() => {}}
        currencySymbol="€"
        vat={{ tier: withVat, rate: 23, label: "IVA" }}
      />,
    );
    expect(screen.getByText("Before VAT")).toBeInTheDocument();
    const preview = screen.getByTestId("member-vat-preview").textContent ?? "";
    expect(preview).toContain("24.60");
    expect(preview).toContain("IVA 23%");
  });

  it("says nothing extra on a ticket with no VAT", () => {
    renderWithConfig(
      <MemberPricingSection
        state={{ loading: false, error: null, rows: [row()] }}
        onRowChange={() => {}}
        currencySymbol="€"
        vat={{ tier: tier(), rate: null, label: "IVA" }}
      />,
    );
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.queryByTestId("member-vat-preview")).toBeNull();
  });
});
