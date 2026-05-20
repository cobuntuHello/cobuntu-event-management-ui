"use client";

import * as React from "react";
import { Trash2, GripVertical, Copy, ChevronRight } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";

export interface TierRowProps {
  t: DraftTier & { _idx: number };
  canDelete: boolean;
  canDuplicate: boolean;
  /** Click anywhere on the row → modal enters Level 2 (per-tier hub). */
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  dragAttributes?: any;
  dragListeners?: any;
}

/**
 * Compact tier row for the Level 1 (tier list) view of the redesigned
 * PriceEditModal. Each row is a clickable summary that takes the user
 * to Level 2 (per-tier hub takeover) where they can edit any section.
 *
 * Editing the tier name happens at Level 2 (TierHubView), not inline
 * here — keeps the list view clean and forces a "select tier first"
 * navigation that matches the user's mental model of "click the tier
 * to enter its details".
 */
export function TierRow({
  t,
  canDelete,
  canDuplicate,
  onSelect,
  onRemove,
  onDuplicate,
  dragAttributes,
  dragListeners,
}: TierRowProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);
  const capCap = t.capacity ? parseInt(t.capacity, 10) : null;
  const soldLabel = locked
    ? capCap != null
      ? `${t.salesCount}/${capCap}`
      : `${t.salesCount} sold`
    : null;

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-zinc-50/60 transition-colors rounded-xl"
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
      >
        {dragListeners && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="p-1 -ml-2 -my-1 text-zinc-300 hover:text-zinc-600 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            {...dragAttributes}
            {...dragListeners}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">
            {t.name || <span className="text-zinc-400 font-normal">Unnamed tier</span>}
          </p>
        </div>
        {t.hasForm && (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
            Form
          </span>
        )}
        {t.priceMode === "pwyw" && (
          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full shrink-0">
            PWYW
          </span>
        )}
        {t.installmentEnabled && (
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
            Installments
          </span>
        )}
        {soldLabel && (
          <span className="text-[11px] font-medium text-zinc-500 tabular-nums shrink-0">
            {soldLabel}
          </span>
        )}
        <span className="text-[13px] font-semibold text-zinc-700 tabular-nums shrink-0">
          {t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free"}
        </span>
        {canDuplicate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 cursor-pointer rounded-md hover:bg-zinc-100 transition-colors shrink-0"
            title="Duplicate tier"
            aria-label="Duplicate tier"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 text-zinc-400 hover:text-red-500 cursor-pointer rounded-md hover:bg-red-50 transition-colors shrink-0"
            title="Remove tier"
            aria-label="Remove tier"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" aria-hidden />
      </div>
    </div>
  );
}

/**
 * Adapter that gives TierRow the dnd-kit hooks. Keeps TierRow itself
 * presentation-only.
 */
export function SortableTierRow(props: TierRowProps) {
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
      <TierRow {...props} dragAttributes={attributes} dragListeners={listeners} />
    </div>
  );
}
