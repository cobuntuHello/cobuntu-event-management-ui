"use client";

import * as React from "react";
import {
  Trash2,
  FileText,
  ChevronDown,
  Lock,
  GripVertical,
  Copy,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import {
  MemberPricingSection,
  type MemberPricingSectionHandle,
} from "../MemberPricingSection";
import type { DraftTier } from "./types";
import { SUPPORTED_CURRENCIES } from "./types";
import { getSymbol, isTierLocked } from "./helpers";
import { Collapse, Eyebrow } from "./_primitives";

export interface TierCardProps {
  t: DraftTier & { _idx: number };
  communityTag: string;
  canDelete: boolean;
  canDuplicate: boolean;
  onUpdate: (patch: Partial<DraftTier>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onOpenForm: () => void;
  /** Render MemberPricingSection inside the expanded body. Community-
   *  only — admin sets true, community-app /manage omits. */
  showMemberPricing: boolean;
  showToast: (msg: string) => void;
  /** Imperative ref registration so the outer modal can call
   *  commit()/isDirty() on this tier's MemberPricingSection during its
   *  global Save loop. Called on mount with the handle, on unmount
   *  with null. */
  registerMemberPricingRef?: (tierId: string, handle: MemberPricingSectionHandle | null) => void;
  dragAttributes?: any;
  dragListeners?: any;
}

/**
 * Adapter that gives TierCard the dnd-kit hooks. Keeps TierCard itself
 * presentation-only — it only knows it has a drag handle to render.
 */
export function SortableTierCard(props: TierCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.t.localId,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <TierCard {...props} dragAttributes={attributes} dragListeners={listeners} />
    </div>
  );
}

export function TierCard({
  t,
  communityTag,
  canDelete,
  canDuplicate,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggle,
  onOpenForm,
  showMemberPricing,
  showToast,
  registerMemberPricingRef,
  dragAttributes,
  dragListeners,
}: TierCardProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);
  const capCap = t.capacity ? parseInt(t.capacity, 10) : null;
  const soldLabel = locked
    ? capCap != null
      ? `${t.salesCount}/${capCap}`
      : `${t.salesCount} sold`
    : null;
  return (
    <div className="group rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Compact header row — name on the left, price summary on the right, expand chevron + delete */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Drag handle — appears on hover. Skip when there's nothing else to drag against. */}
        {dragListeners && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="p-1 -ml-2 -my-1 text-zinc-300 hover:text-zinc-600 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            {...dragAttributes}
            {...dragListeners}
            onClick={(e) => e.preventDefault()}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={t.expanded ? "Collapse" : "Expand"}
          className="p-1 -m-1 text-zinc-400 hover:text-zinc-700 cursor-pointer transition-colors shrink-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${t.expanded ? "" : "-rotate-90"}`} />
        </button>
        <input
          type="text"
          value={t.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Tier name"
          className="flex-1 min-w-0 px-0 py-1 text-[14px] font-semibold text-zinc-900 placeholder:text-zinc-400 bg-transparent border-0 focus:outline-none focus:ring-0"
        />
        {/* Badges */}
        {t.hasForm && (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Form</span>
        )}
        {t.priceMode === "pwyw" && (
          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full shrink-0">PWYW</span>
        )}
        {/* Compact summary when collapsed: price + sold count if any */}
        {!t.expanded && (
          <span className="flex items-center gap-2 shrink-0">
            {soldLabel && (
              <span className="text-[11px] font-medium text-zinc-500 tabular-nums">{soldLabel}</span>
            )}
            <span className="text-[13px] font-semibold text-zinc-700 tabular-nums">
              {t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free"}
            </span>
          </span>
        )}
        {canDuplicate && (
          <button
            onClick={onDuplicate}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 cursor-pointer rounded-md hover:bg-zinc-100 transition-colors shrink-0"
            title="Duplicate tier"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onRemove}
            className="p-1.5 text-zinc-400 hover:text-red-500 cursor-pointer rounded-md hover:bg-red-50 transition-colors shrink-0"
            title="Remove tier"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded body — wrapped in Collapse for smooth height-auto animation */}
      <Collapse open={t.expanded}>
        <div className="border-t border-zinc-100">
          {/* Lock banner — shown when paid attendees exist on this tier */}
          {locked && (
            <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50/70 border-b border-amber-100">
              <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
              <p className="text-[12px] text-amber-700">
                <span className="font-medium">{t.salesCount} ticket{t.salesCount !== 1 ? "s" : ""} sold</span>
                {" — price and currency are locked. Refund all sales first to change them."}
              </p>
            </div>
          )}

          {/* Description */}
          <div className="px-4 pt-3 pb-2">
            <Eyebrow>Description</Eyebrow>
            <input
              type="text"
              value={t.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="What's included (optional)"
              className="w-full mt-1 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
            />
          </div>

          {/* Pricing model: fixed vs pay-what-you-want. PWYW means the
              tier's listed price is a placeholder — buyer chooses an
              amount above the optional minimum at checkout. Locked once
              paid attendees exist (server-side too). */}
          <div className="px-4 pt-3 pb-1">
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

          {/* Price / Currency / Capacity */}
          <div className="grid grid-cols-[1fr_110px_100px] gap-2.5 px-4 py-2">
            <div>
              <Eyebrow>{t.priceMode === "pwyw" ? "Suggested price" : "Price"}</Eyebrow>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={t.price}
                  onChange={(e) => onUpdate({ price: e.target.value })}
                  placeholder="0.00"
                  disabled={locked}
                  title={locked ? "Refund all sales first to change price" : undefined}
                  className={`w-full pl-7 pr-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
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
                      <span className="text-zinc-500 mr-1">{c.symbol}</span>{c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Eyebrow>Capacity</Eyebrow>
              <input
                type="number" min={locked ? t.salesCount : 0} step="1" value={t.capacity}
                onChange={(e) => onUpdate({ capacity: e.target.value })}
                placeholder="∞"
                className="w-full mt-1 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-300 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {locked && (
                <p className="text-[10px] text-zinc-400 mt-1">Min {t.salesCount} (already sold)</p>
              )}
            </div>
          </div>

          {/* PWYW minimum (only when priceMode is pwyw). Optional. */}
          <Collapse open={t.priceMode === "pwyw"}>
            <div className="px-4 pb-2">
              <Eyebrow>Minimum amount (optional)</Eyebrow>
              <div className="relative mt-1 max-w-[220px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={t.pwywMin}
                  onChange={(e) => onUpdate({ pwywMin: e.target.value })}
                  placeholder="No minimum"
                  disabled={locked}
                  className={`w-full pl-7 pr-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                />
              </div>
            </div>
          </Collapse>

          {/* Installment plan — opt-in toggle + 3 inputs (events skip
              accessDurationMonths; event date bounds access). Backend
              enforces three-or-none + range bounds; the same checks
              run client-side in save() so the host sees inline errors.
              Locked once paid attendees exist — server-side too. */}
          <div className="px-4 pt-3 pb-2 border-t border-zinc-100">
            <label className={`flex items-center gap-2 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={t.installmentEnabled}
                disabled={locked}
                onChange={(e) => onUpdate({ installmentEnabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 disabled:cursor-not-allowed"
              />
              <span className={`text-[12px] font-medium ${locked ? "text-zinc-400" : "text-zinc-700"}`}>
                Offer an installment plan
              </span>
            </label>
            <p className="text-[11px] text-zinc-500 mt-1">
              Let buyers pay this tier in equal monthly charges instead of one upfront payment.
            </p>
            <Collapse open={t.installmentEnabled}>
              <div className="grid grid-cols-3 gap-2.5 mt-2">
                <div>
                  <Eyebrow>Total ({sym})</Eyebrow>
                  <input
                    type="number" min="0" step="0.01" value={t.installmentTotal}
                    onChange={(e) => onUpdate({ installmentTotal: e.target.value })}
                    placeholder="300"
                    disabled={locked}
                    className={`w-full mt-1 px-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                  />
                </div>
                <div>
                  <Eyebrow>Charges</Eyebrow>
                  <input
                    type="number" min="2" step="1" value={t.installmentCount}
                    onChange={(e) => onUpdate({ installmentCount: e.target.value })}
                    placeholder="3"
                    disabled={locked}
                    className={`w-full mt-1 px-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                  />
                </div>
                <div>
                  <Eyebrow>Every (months)</Eyebrow>
                  <input
                    type="number" min="1" step="1" value={t.installmentInterval}
                    onChange={(e) => onUpdate({ installmentInterval: e.target.value })}
                    placeholder="1"
                    disabled={locked}
                    className={`w-full mt-1 px-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                  />
                </div>
              </div>
              {t.installmentEnabled
                && t.installmentTotal
                && t.installmentCount
                && parseInt(t.installmentCount, 10) >= 2 && (
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Buyer pays {sym}{(parseFloat(t.installmentTotal) / parseInt(t.installmentCount, 10)).toFixed(2)} every {t.installmentInterval || "1"} month{(t.installmentInterval || "1") !== "1" ? "s" : ""} for {t.installmentCount} charges.
                </p>
              )}
            </Collapse>
            {locked && t.installmentEnabled && (
              <p className="text-[10px] text-amber-600 mt-1">
                Installment plan is locked while tickets are sold. Refund all sales first to change.
              </p>
            )}
          </div>

          {/* Member pricing — community-only, saved-tiers only. Imperative
              commit() via ref so the outer modal's single Save commits
              member-pricing overrides alongside tier writes (no nested
              Save button). Unsaved drafts (no `t.id`) skip it entirely
              since the backend needs a real tier id. */}
          {showMemberPricing && t.id && (
            <MemberPricingSection
              ref={(handle) => {
                registerMemberPricingRef?.(t.id!, handle);
              }}
              communityTag={communityTag}
              tierId={t.id}
              currencyCode={t.currency}
              currencySymbol={sym}
              showToast={showToast}
            />
          )}

          {/* Form footer */}
          <button
            type="button"
            onClick={onOpenForm}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 border-t border-zinc-100 bg-zinc-50/60 text-left hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!t.id}
            title={!t.id ? "Save this tier first to add a form" : undefined}
          >
            <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-zinc-700">
                Registration form
                {t.hasForm && (
                  <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    {t.formFieldCount} field{t.formFieldCount !== 1 ? "s" : ""} · Linked
                  </span>
                )}
                {!t.id && t.sourceTierId && (
                  <span className="ml-1.5 text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">Copying from {t.sourceTierName || "source"}</span>
                )}
              </p>
              <p className="text-[11px] text-zinc-400 truncate">
                {!t.id && t.sourceTierId
                  ? `Form will copy from "${t.sourceTierName || "source tier"}" when you save`
                  : t.hasForm
                    ? "Edit the questions attendees fill out at this tier"
                    : t.id
                      ? "Add custom questions for attendees at this tier"
                      : "Save tier to add a form"}
              </p>
            </div>
            <span className="text-[11px] font-medium text-zinc-500 shrink-0">{t.hasForm ? "Manage →" : "Add →"}</span>
          </button>
        </div>
      </Collapse>
    </div>
  );
}
