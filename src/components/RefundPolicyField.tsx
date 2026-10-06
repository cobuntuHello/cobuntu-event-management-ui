import * as React from "react";

/**
 * The host's refund choice, as ONE shared control used in both places it is set:
 * inline in the create wizard's "Policies & access" step (EventForm), and inside
 * the manage-page refund modal (RefundPolicyEditModal). Same widget, same two
 * options, so the setting cannot read as two different features. Mirrors the
 * product-management-ui control of the same name.
 *
 * Two presets, not the full mode/window matrix the backend supports:
 *   - Standard refunds        → the platform default window (policy = null)
 *   - No self-service refunds  → buyers contact the host (customBuyerWindowDays: 0)
 *
 * `mode: 'extended'` is a host-side payout power, not a buyer-facing policy, so it
 * is not offered here; a preset writes mode 'default'.
 */
export type RefundPolicyValue = { mode?: string | null; customBuyerWindowDays?: number | null } | null;

/** True when the policy disables buyer self-service refunds. */
export function refundsDisabled(v: RefundPolicyValue): boolean {
  return !!v && v.customBuyerWindowDays === 0;
}

export const REFUND_STANDARD: RefundPolicyValue = null;
export const REFUND_NONE: RefundPolicyValue = { mode: "default", customBuyerWindowDays: 0 };

export function RefundPolicyField({
  value,
  onChange,
}: {
  value: RefundPolicyValue;
  onChange: (next: RefundPolicyValue) => void;
}) {
  const off = refundsDisabled(value);
  return (
    <div className="flex flex-col gap-2">
      <RefundOption
        selected={!off}
        onClick={() => onChange(REFUND_STANDARD)}
        title="Standard refunds"
        subtitle="Buyers can self-refund within the usual window. You can always refund a buyer directly."
      />
      <RefundOption
        selected={off}
        onClick={() => onChange(REFUND_NONE)}
        title="No self-service refunds"
        subtitle="Buyers can't refund themselves — they contact you instead, and you can still refund them directly."
      />
    </div>
  );
}

function RefundOption({
  selected,
  onClick,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
        selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50/50"
      }`}
    >
      <span
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-zinc-900" : "border-zinc-300"
        }`}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-zinc-900">{title}</span>
        <span className="block text-[12px] text-zinc-500">{subtitle}</span>
      </span>
    </button>
  );
}
