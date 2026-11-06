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

describe("VAT arithmetic", () => {
  it("sends the buyer price for a price typed before VAT", () => {
    const t = tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED" });
    expect(buyerPriceToSend(t, 23)).toBe(36.9);
  });

  it("sends the typed price as-is when it already includes VAT", () => {
    expect(buyerPriceToSend(tier({ vatCategory: "STANDARD", vatPriceEntry: "INCLUDED" }), 23)).toBe(30);
    expect(buyerPriceToSend(tier(), null)).toBe(30);
  });

  it("shows a stored €36.90 back as €30 when it was entered before VAT", () => {
    expect(typedPriceFromStored(3690, "EUR", "ADDED", "STANDARD", 23)).toBe("30");
    expect(typedPriceFromStored(3690, "EUR", "INCLUDED", "STANDARD", 23)).toBe("36.9");
  });

  it("previews both ways with the backend's rounding", () => {
    expect(vatPreview(tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED" }), 23)).toEqual({ gross: 3690, net: 3000, vat: 690 });
    expect(vatPreview(tier({ vatCategory: "STANDARD", vatPriceEntry: "INCLUDED" }), 23)).toEqual({ gross: 3000, net: 2439, vat: 561 });
  });

  it("treats pay-what-you-want and exempt tickets as price-includes", () => {
    expect(entersNet(tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED", priceMode: "pwyw" }))).toBe(false);
    expect(entersNet(tier({ vatCategory: "EXEMPT", vatPriceEntry: "ADDED" }))).toBe(false);
  });

  it("finds the rate for a category only when VAT is available", () => {
    expect(vatRateFor(PT, "REDUCED")).toBe(6);
    expect(vatRateFor({ ...PT, available: false }, "REDUCED")).toBeNull();
    expect(vatRateFor(PT, null)).toBeNull();
  });
});

describe("buildTierBody", () => {
  it("sends €36.90 and the VAT setting when the host set IVA 23% on top of €30", () => {
    const body = buildTierBody(tier({ vatCategory: "STANDARD", vatPriceEntry: "ADDED" }), { vatRate: 23, vatChanged: true });
    expect(body).toMatchObject({ price: 36.9, vatCategory: "STANDARD", vatPriceEntry: "ADDED" });
  });

  it("leaves the VAT fields out when they did not change (an unrelated edit is never refused)", () => {
    const body = buildTierBody(tier({ vatCategory: "STANDARD", vatPriceEntry: "INCLUDED" }), { vatRate: 23, vatChanged: false });
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
  it("offers the Portuguese rates and previews IVA added on top", async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    renderWithConfig(<Harness initial={tier()} options={PT} onChange={changes} />);
    await user.click(screen.getByRole("radio", { name: /IVA 23%/ }));
    await user.click(screen.getByRole("radio", { name: /Add IVA to the price/ }));
    // "€30 + IVA": the typed €30 is kept and now means the price before VAT.
    expect(screen.getByTestId("vat-preview").textContent).toMatch(/36[.,]90.*30[.,]00.*IVA 23%.*6[.,]90/);
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ vatCategory: "STANDARD", vatPriceEntry: "ADDED", price: "30" }));
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

  it("previews VAT inside the price when the price includes it", async () => {
    const user = userEvent.setup();
    renderWithConfig(<Harness initial={tier()} options={PT} />);
    await user.click(screen.getByRole("radio", { name: /IVA 23%/ }));
    expect(screen.getByTestId("vat-preview").textContent).toMatch(/30[.,]00.*IVA 23%.*5[.,]61/);
  });

  it("removing VAT keeps the typed price and clears the setting", async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    renderWithConfig(<Harness initial={tier({ price: "30", vatCategory: "STANDARD", vatPriceEntry: "ADDED" })} options={PT} onChange={changes} />);
    await user.click(screen.getByRole("radio", { name: "No VAT" }));
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ vatCategory: null, vatPriceEntry: "INCLUDED", price: "30" }));
  });
});
