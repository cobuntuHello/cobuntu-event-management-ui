"use client";

import * as React from "react";
import {
  Trash2,
  ChevronDown,
  GripVertical,
  Copy,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type MemberPricingSectionHandle } from "../MemberPricingSection";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";
import { Collapse } from "./_primitives";
import { EditHub } from "./EditHub";

export interface TierCardProps {
  t: DraftTier & { _idx: number };
  communityTag: string;
  canDelete: boolean;
  canDuplicate: boolean;
  onUpdate: (patch: Partial<DraftTier>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  /** Render MemberPricingSection (via EditHub → MembersStep) inside
   *  the expanded body. Community-only — admin sets true, community-app
   *  /manage omits. */
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

/**
 * Tier-row card. Compact header (name + price summary + duplicate /
 * delete) collapses/expands. The expanded body delegates to EditHub,
 * which renders the four section-card landing (Basics / Options /
 * Members / Form) and routes into the step views.
 */
export function TierCard({
  t,
  communityTag,
  canDelete,
  canDuplicate,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggle,
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
        {/* Drag handle — appears on hover. */}
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
        {t.installmentEnabled && (
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">Installments</span>
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

      {/* Expanded body — delegates to EditHub for the four-section
          landing. Wrapped in Collapse for the smooth height-auto
          animation that hosts already expect from this card. */}
      <Collapse open={t.expanded}>
        <EditHub
          t={t}
          communityTag={communityTag}
          onUpdate={onUpdate}
          showMemberPricing={showMemberPricing}
          registerMemberPricingRef={registerMemberPricingRef}
          showToast={showToast}
        />
      </Collapse>
    </div>
  );
}
