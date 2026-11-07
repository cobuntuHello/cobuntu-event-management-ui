"use client";

/**
 * Seller VAT on a ticket (backend docs/features/seller-vat.md).
 *
 * Which rate, and whether the price the host typed already includes VAT or has
 * VAT added on top. Buyers always see the final price; the preview line says
 * exactly what they pay and how much of it is VAT. When VAT cannot apply here
 * the section says why (the server's reason), instead of offering a rate it
 * would refuse.
 */
import { Eyebrow } from "./_primitives";
import type { DraftTier, VatOptions, VatCategory } from "./types";
import { money, vatRateFor, vatPreview } from "./vat";
import { toSmallestUnit } from "./helpers";
import { useEventT } from "../../create-wizard/i18n";

export interface VatSectionProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** undefined = loading; null = not offered here (create wizard / fetch failed). */
  options: VatOptions | null | undefined;
  locked: boolean;
}

const CATEGORY_KEY: Record<VatCategory, string> = {
  STANDARD: "standard",
  INTERMEDIATE: "intermediate",
  REDUCED: "reduced",
  SUPER_REDUCED: "superReduced",
  EXEMPT: "exempt",
};

export function VatSection({ t, onUpdate, options, locked }: VatSectionProps) {
  const tx = useEventT("eventsUi.manageUi.vatSection");
  if (options === undefined || options === null) return null;

  if (!options.available) {
    // Nothing to choose. Only worth a line when it is actionable or explains
    // a ticket that already had VAT set.
    if (!options.reasonText) return null;
    return (
      <div>
        <Eyebrow>{tx("title")}</Eyebrow>
        <p className="text-[12px] text-zinc-500 mt-1.5 leading-relaxed">{options.reasonText}</p>
      </div>
    );
  }

  const label = options.jurisdiction?.label ?? "VAT";
  const rate = vatRateFor(options, t.vatCategory);
  const pwyw = t.priceMode === "pwyw";
  const exempt = t.vatCategory === "EXEMPT";

  // The price is always before VAT: choosing a rate never changes it, and the
  // preview states what buyers pay at checkout.
  const setCategory = (next: VatCategory | null) => {
    if (locked) return;
    onUpdate({ vatCategory: next, vatPriceEntry: "ADDED" });
  };

  const preview = t.vatCategory && !exempt ? vatPreview(t, rate) : null;
  const typedMinor = Number.isFinite(parseFloat(t.price)) ? toSmallestUnit(parseFloat(t.price), t.currency) : null;

  return (
    <div>
      <Eyebrow help={tx("help", { country: options.jurisdiction?.name ?? "", label })}>{tx("title")}</Eyebrow>

      <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={tx("title")}>
        <button
          type="button"
          role="radio"
          aria-checked={!t.vatCategory}
          disabled={locked}
          onClick={() => setCategory(null)}
          className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${!t.vatCategory ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
        >
          {tx("none")}
        </button>
        {options.options.map((o) => {
          const active = t.vatCategory === o.category;
          return (
            <button
              key={o.category}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={locked}
              onClick={() => setCategory(o.category)}
              className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${active ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
            >
              {o.category === "EXEMPT" ? tx("exempt") : `${label} ${o.rate}%`}
              {o.category !== "EXEMPT" && <span className="opacity-60"> · {tx(CATEGORY_KEY[o.category])}</span>}
            </button>
          );
        })}
      </div>

      {preview && !pwyw && (
        <p className="text-[12px] text-zinc-600 mt-2 leading-relaxed" data-testid="vat-preview">
          {tx("previewAdded", {
            gross: money(preview.gross, t.currency),
            net: money(preview.net, t.currency),
            label,
            rate: String(rate),
            vat: money(preview.vat, t.currency),
          })}
        </p>
      )}
      {pwyw && t.vatCategory && !exempt && (
        <p className="text-[12px] text-zinc-500 mt-2">{tx("pwywNote", { label })}</p>
      )}
      {exempt && typedMinor != null && (
        <p className="text-[12px] text-zinc-600 mt-2">{tx("previewExempt", { gross: money(typedMinor, t.currency), label })}</p>
      )}
      {locked && <p className="text-[11px] text-zinc-400 mt-1.5">{tx("lockedNote")}</p>}
    </div>
  );
}

