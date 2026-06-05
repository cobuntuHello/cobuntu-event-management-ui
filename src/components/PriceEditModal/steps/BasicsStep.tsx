"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../ui/select";
import {
  BillingRadio,
  type BillingMode,
} from "@cobuntu/management-ui-shared";
import { SUPPORTED_CURRENCIES, type DraftTier } from "../types";
import { getSymbol, isTierLocked } from "../helpers";
import { Collapse, Eyebrow, StepInput } from "../_primitives";
import { SchedulingSection } from "../../SchedulingSection";

export interface BasicsStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}

/**
 * "Basics" step — the single per-tier pricing surface. Field order is
 * deliberate: pricing model → price → billing mode → auto-schedule, so
 * the host decides HOW the tier is priced before typing the amount.
 * (Capacity moved up to the tier hub, next to the name, so it's visible
 * without opening this step.)
 *
 * Events expose ONE_TIME + INSTALLMENT_PLAN only (events checkout uses
 * Stripe mode='payment'; RECURRING would silently no-op). Billing mode is
 * a derived view over the `installmentEnabled` flag. The installment trio
 * respects the backend's three-or-none validator (count >= 2, interval >=
 * 1 month, total > 0). Price/currency/mode lock once a tier has sales.
 */
export function BasicsStep({ t, onUpdate }: BasicsStepProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);

  const billingMode: BillingMode = t.installmentEnabled ? "INSTALLMENT_PLAN" : "ONE_TIME";

  return (
    <div className="space-y-4">
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

      {/* Pricing model — fixed vs PWYW. Above the price so the host picks
          the model before typing the amount. Locked once sales exist. */}
      <div>
        <Eyebrow>Pricing model</Eyebrow>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <button
            type="button"
            onClick={() => !locked && onUpdate({ priceMode: "fixed" })}
            disabled={locked}
            className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >Fixed price</button>
          <button
            type="button"
            onClick={() => !locked && onUpdate({ priceMode: "pwyw" })}
            disabled={locked}
            className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >Pay what you want</button>
        </div>
        {t.priceMode === "pwyw" && (
          <p className="text-[11px] text-zinc-500 mt-1.5">
            Buyer chooses the amount at checkout. The price below acts as a suggested default.
          </p>
        )}
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

      {/* PWYW minimum — the floor under the buyer-chosen amount. */}
      <Collapse open={t.priceMode === "pwyw"}>
        <div>
          <Eyebrow>Minimum amount (optional)</Eyebrow>
          <div className="mt-1 max-w-[220px]">
            <StepInput
              type="number" min="0" step="0.01" value={t.pwywMin}
              onChange={(e) => onUpdate({ pwywMin: e.target.value })}
              placeholder="No minimum"
              locked={locked}
              prefix={sym}
            />
          </div>
        </div>
      </Collapse>

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
                description: "Buyers pay in equal monthly charges; configure the schedule below.",
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

      {/* Installment schedule — only meaningful when Billing mode is
          INSTALLMENT_PLAN. Validation lives in helpers.validateTier; the
          user sees a per-field hint instead. */}
      <Collapse open={t.installmentEnabled}>
        <div className="space-y-2">
          <div>
            <Eyebrow>Installment schedule</Eyebrow>
            <p className="text-[11px] text-zinc-500 mt-1">
              The total below is charged in equal parts over the count and interval.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <Eyebrow>Total ({sym})</Eyebrow>
              <div className="mt-1">
                <StepInput
                  type="number" min="0" step="0.01" value={t.installmentTotal}
                  onChange={(e) => onUpdate({ installmentTotal: e.target.value })}
                  placeholder="300"
                  locked={locked}
                />
              </div>
            </div>
            <div>
              <Eyebrow>Charges</Eyebrow>
              <div className="mt-1">
                <StepInput
                  type="number" min="2" step="1" value={t.installmentCount}
                  onChange={(e) => onUpdate({ installmentCount: e.target.value })}
                  placeholder="3"
                  locked={locked}
                />
              </div>
            </div>
            <div>
              <Eyebrow>Every (months)</Eyebrow>
              <div className="mt-1">
                <StepInput
                  type="number" min="1" step="1" value={t.installmentInterval}
                  onChange={(e) => onUpdate({ installmentInterval: e.target.value })}
                  placeholder="1"
                  locked={locked}
                />
              </div>
            </div>
          </div>
          {t.installmentEnabled
            && t.installmentTotal
            && t.installmentCount
            && parseInt(t.installmentCount, 10) >= 2 && (
            <p className="text-[11px] text-zinc-500">
              Buyer pays {sym}{(parseFloat(t.installmentTotal) / parseInt(t.installmentCount, 10)).toFixed(2)} every {t.installmentInterval || "1"} month{(t.installmentInterval || "1") !== "1" ? "s" : ""} for {t.installmentCount} charges.
            </p>
          )}
          {locked && (
            <p className="text-[10px] text-amber-600">
              Installment plan is locked while tickets are sold.
            </p>
          )}
        </div>
      </Collapse>

      {/* Auto-schedule sales window. */}
      <SchedulingSection
        draft={{
          publishedAt: t.publishedAt,
          autoScheduleEnabled: t.autoScheduleEnabled,
          salesStartAt: t.salesStartAt,
          salesEndAt: t.salesEndAt,
        }}
        onChange={(patch) => onUpdate(patch as Partial<DraftTier>)}
      />
    </div>
  );
}
