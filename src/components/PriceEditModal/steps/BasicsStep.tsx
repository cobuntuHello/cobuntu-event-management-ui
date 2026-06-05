"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../ui/select";
import {
  BillingRadio,
  type BillingMode,
} from "@cobuntu/management-ui-shared";
import { SUPPORTED_CURRENCIES, type DraftTier } from "../types";
import { getSymbol, isTierLocked } from "../helpers";
import { Eyebrow, StepInput } from "../_primitives";

export interface BasicsStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}

/**
 * "Basics" step — the canonical fields every tier needs: name + price +
 * currency + billing mode. Events expose ONE_TIME and INSTALLMENT_PLAN
 * only (events checkout uses Stripe mode='payment'; RECURRING would
 * silently no-op).
 *
 * Billing mode is a derived view over the existing `installmentEnabled`
 * flag — keeps the draft shape backwards-compatible with the legacy
 * inline editor while letting the redesigned UI use the radio.
 */
export function BasicsStep({ t, onUpdate }: BasicsStepProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);

  const billingMode: BillingMode = t.installmentEnabled ? "INSTALLMENT_PLAN" : "ONE_TIME";

  return (
    <div className="space-y-4">
      {/* Tier name lives in the row header (TierCard's inline input) —
          renaming from the row is the quickest path. Editing here would
          duplicate that affordance without adding new capability. */}

      {/* Description */}
      <div>
        <Eyebrow>Description (optional)</Eyebrow>
        <div className="mt-1">
          <StepInput
            type="text"
            value={t.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="What's included"
          />
        </div>
      </div>

      {/* Price + Currency */}
      <div className="grid grid-cols-[1fr_120px] gap-2.5">
        <div>
          <Eyebrow>{t.priceMode === "pwyw" ? "Suggested price" : "Price"}</Eyebrow>
          <div className="mt-1">
            <StepInput
              type="number" min="0" step="0.01" value={t.price}
              onChange={(e) => onUpdate({ price: e.target.value })}
              placeholder="0.00"
              locked={locked}
              prefix={sym}
              title={locked ? "Refund all sales first to change price" : undefined}
            />
          </div>
        </div>
        <div>
          <Eyebrow>Currency</Eyebrow>
          <Select value={t.currency} onValueChange={(v) => onUpdate({ currency: v })} disabled={locked}>
            <SelectTrigger className={`h-[38px] mt-1 text-[13px] ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : ""}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="mr-1.5">{c.flag}</span>{c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Billing mode — events only expose one-time + installment-plan.
          Recurring is hidden via the `hidden` flag because event checkout
          runs Stripe in mode='payment' and a subscription tier would
          silently no-op. Marketplace products surface all three modes. */}
      <div>
        <Eyebrow>Billing mode</Eyebrow>
        <div className="mt-1.5">
          <BillingRadio
            value={billingMode}
            onChange={(next) =>
              onUpdate({ installmentEnabled: next === "INSTALLMENT_PLAN" })
            }
            disabled={locked}
            options={[
              {
                value: "ONE_TIME",
                label: "One-time",
                description: "Buyers pay the full price at checkout.",
              },
              {
                value: "RECURRING",
                label: "Recurring",
                description: "Not available for events.",
                hidden: true,
              },
              {
                value: "INSTALLMENT_PLAN",
                label: "Installment plan",
                description: "Buyers pay in equal monthly charges; configure the schedule in the Options step.",
              },
            ]}
          />
        </div>
        {locked && (
          <p className="text-[11px] text-amber-600 mt-1.5">
            Billing mode is locked while tickets are sold. Refund all sales first to change.
          </p>
        )}
      </div>
    </div>
  );
}
