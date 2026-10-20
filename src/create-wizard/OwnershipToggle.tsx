"use client";

import type { ReactNode } from "react";
import { useWizardT } from "./i18n";

/**
 * Who hosts what a leader is about to create: the community, or themselves.
 * Lifted from the community app (components/marketplace/OwnershipToggle.tsx)
 * with the brand and session read from props instead of app contexts. Same
 * cards, same copy (eventsUi.ownership).
 *
 * Only leaders (EVENTS_CREATE) see this: the backend refuses community
 * ownership for anyone else, so offering it would be offering a lie.
 *
 * The community's avatar is SQUARE and the person's ROUND, the distinction the
 * app draws between an organisation and a person. The chosen card fills with
 * the brand colour (a lightness inversion, so it never relies on hue alone).
 */
export type EventOwnership = "community" | "personal";

export function OwnershipToggle({
  value,
  onChange,
  communityName,
  communityIconUrl,
  viewer,
  disabled,
  platformFeeRate,
  copyNamespace = "eventsUi.ownership",
}: {
  value: EventOwnership;
  onChange: (next: EventOwnership) => void;
  communityName: string;
  communityIconUrl?: string | null;
  viewer?: { name?: string | null; profileImage?: string | null };
  disabled?: boolean;
  /** What Cobuntu charges this community for events (0..1); undefined names the fee without a number. */
  platformFeeRate?: number;
  copyNamespace?: string;
}) {
  const t = useWizardT(copyNamespace);
  const rich = (key: string, values?: Record<string, string>) =>
    t.rich(key, { ...values, b: (c: ReactNode) => <b className="font-semibold">{c}</b> });

  // "8%", not "8.0000%": the rate is a Decimal(5,4); keep up to two decimals
  // because a negotiated 7.5% must not read as 8%.
  const formattedFee = platformFeeRate == null ? null : `${Number((platformFeeRate * 100).toFixed(2))}%`;

  const options: { key: EventOwnership; name: string; sub: string; facts: ReactNode[]; avatar: ReactNode }[] = [
    {
      key: "community",
      name: t("communityLabel", { community: communityName }),
      sub: t("communitySub"),
      facts: [
        rich("communityPayout"),
        rich("communityCommission"),
        formattedFee ? rich("communityCobuntuFee", { rate: formattedFee }) : rich("communityCobuntuFeeUnknown"),
        rich("communityStripe"),
        rich("communityOptions"),
      ],
      avatar: <OwnerAvatar shape="square" src={communityIconUrl ?? null} name={communityName} />,
    },
    {
      key: "personal",
      name: t("personalLabel"),
      sub: t("personalSub"),
      facts: [
        rich("personalPayout"),
        rich("personalCommission"),
        rich("personalCobuntuFee"),
        rich("personalStripe"),
        rich("personalOptions"),
      ],
      avatar: <OwnerAvatar shape="round" src={viewer?.profileImage ?? null} name={viewer?.name || "You"} />,
    },
  ];

  return (
    // `md:`, not a container query: there is no @container ancestor to measure.
    <div className="grid gap-3 md:grid-cols-2" role="radiogroup">
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            className="flex flex-col rounded-[var(--button-radius,0.75rem)] border p-5 text-left transition-colors duration-150 disabled:opacity-50 cursor-pointer"
            style={{
              color: active ? "var(--brand-contrast, #fff)" : "var(--text-color)",
              background: active ? "var(--brand-color, #18181b)" : "transparent",
              borderColor: active ? "var(--brand-color, #18181b)" : "color-mix(in srgb, currentColor 16%, transparent)",
            }}
          >
            <span className="flex items-center gap-3">
              {opt.avatar}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] leading-tight" style={{ fontWeight: active ? 650 : 550 }}>
                  {opt.name}
                </span>
                <span className="mt-0.5 block truncate text-[13px] opacity-60">{opt.sub}</span>
              </span>
            </span>

            <span
              className="mt-4 flex flex-1 flex-col border-t text-[13px] leading-snug opacity-80"
              style={{
                borderColor: active
                  ? "color-mix(in srgb, var(--brand-contrast, #fff) 24%, transparent)"
                  : "color-mix(in srgb, currentColor 12%, transparent)",
              }}
            >
              {opt.facts.map((fact, i) => (
                <span
                  key={i}
                  className="block py-2.5"
                  style={i < opt.facts.length - 1 ? {
                    borderBottom: active
                      ? "1px solid color-mix(in srgb, var(--brand-contrast, #fff) 18%, transparent)"
                      : "1px solid color-mix(in srgb, currentColor 9%, transparent)",
                  } : undefined}
                >
                  {fact}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function OwnerAvatar({ shape, src, name }: { shape: "square" | "round"; src: string | null; name: string }) {
  const radius = shape === "square" ? "rounded-[9px]" : "rounded-full";
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`size-9 shrink-0 object-cover ${radius}`}
        style={{ background: "color-mix(in srgb, currentColor 8%, transparent)" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid size-9 shrink-0 place-items-center text-[13px] font-semibold ${radius}`}
      // currentColor: on a selected (brand-filled) card the initial must invert with it.
      style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }}
    >
      {initial}
    </span>
  );
}
