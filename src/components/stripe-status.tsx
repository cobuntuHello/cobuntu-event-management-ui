"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useEventManagementConfig } from "../config";

export interface StripeStatus {
  connected: boolean;
  chargesEnabled: boolean;
  loading: boolean;
  /**
   * True only when the server actually ANSWERED. False while loading, and
   * false when the request failed for any reason.
   *
   * ── Why this field exists ──────────────────────────────────────────────
   *
   * Every failure path here collapses to `connected: false`, which reads as
   * the business fact "this account is not connected" when it may only mean
   * "you were not allowed to ask". The default endpoint
   * (`/stripe/connected`) is gated on ACCESS_ADMIN_APP, so an ordinary member
   * got a 403 and was told the community had no payment account whether or
   * not it had one. That is the same confusion the backend's
   * `derivePaymentsCapability` / `CommunitySearchResult.payments` was added to
   * escape, and it is documented there as having already been got wrong.
   *
   * `connected: false` is kept as-is so every existing caller behaves exactly
   * as before: refusing in the conservative direction is the right default
   * for a GATE. But anything that shows the viewer a CLAIM about their
   * account must check `known` first, because an unproven claim shown to
   * someone who cannot act on it is worse than saying nothing.
   */
  known: boolean;
}

/**
 * Caches Stripe status per communityTag for the lifetime of the page so
 * re-mounts (e.g. opening + closing the price modal repeatedly) don't
 * re-hit the API. Matches the legacy stripeCache behavior.
 */
const stripeCache = new Map<string, { connected: boolean; chargesEnabled: boolean }>();

/**
 * Empties the status cache. For TESTS only.
 *
 * The cache is module-level and keyed only by communityTag, so it outlives
 * every component AND every test in a file. A suite that renders one tag with
 * `{connected: false}` and then mocks a 403 for the same tag gets the first
 * answer back from cache, and the second case silently never runs: it passes
 * or fails on the previous test's data. That is exactly how it behaved before
 * this helper existed, and it made three cases in the no-gate guard
 * order-dependent.
 *
 * Nothing in the app calls this. Within a single page load a cached answer IS
 * the real answer, which is the whole point of the cache.
 */
export function __resetStripeStatusCache() {
  stripeCache.clear();
}

export function useStripeStatus(communityTag: string, opts: { enabled?: boolean } = {}): StripeStatus {
  const { apiBaseUrl, authHeaders, stripeStatusUrl } = useEventManagementConfig();
  const enabled = opts.enabled ?? true;
  const [status, setStatus] = React.useState<StripeStatus>({
    connected: false,
    chargesEnabled: false,
    loading: enabled,
    known: false,
  });

  React.useEffect(() => {
    if (!enabled) {
      // Never asked, so nothing is known.
      setStatus({ connected: false, chargesEnabled: false, loading: false, known: false });
      return;
    }
    if (!communityTag) {
      setStatus({ connected: false, chargesEnabled: false, loading: false, known: false });
      return;
    }
    const cached = stripeCache.get(communityTag);
    if (cached) {
      // Only answers are cached, so a cache hit is by definition known.
      setStatus({ ...cached, loading: false, known: true });
      return;
    }

    (async () => {
      try {
        // Default: /stripe/connected (NOT /stripe/status) — gated on
        // ACCESS_ADMIN_APP so non-financial admins can read the boolean to
        // gate paid-tier edit flows. The community app's member flow
        // overrides this to the member's own Stripe via config.stripeStatusUrl.
        const url = stripeStatusUrl
          ? stripeStatusUrl(communityTag)
          : `${apiBaseUrl}/api/communities/${communityTag}/stripe/connected`;
        const res = await fetch(url, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const result = { connected: !!data.connected, chargesEnabled: !!data.chargesEnabled };
          stripeCache.set(communityTag, result);
          setStatus({ ...result, loading: false, known: true });
        } else {
          /*
           * A 403 here is a PERMISSION answer, not a payments answer. Keeping
           * `connected: false` preserves the conservative behaviour every
           * existing gate relies on; `known: false` is what stops a UI from
           * telling the viewer something the server never said.
           */
          setStatus({ connected: false, chargesEnabled: false, loading: false, known: false });
        }
      } catch {
        setStatus({ connected: false, chargesEnabled: false, loading: false, known: false });
      }
    })();
  }, [communityTag, apiBaseUrl, authHeaders, stripeStatusUrl, enabled]);

  return status;
}

/**
 * An INLINE, non-blocking notice that no payment account is connected yet.
 *
 * ── Why this is not `StripeRequiredWarning` ────────────────────────────────
 *
 * It is the opposite shape. That one is a modal that REPLACES paid-tier
 * editing: it stops you, and it was removed from the tier editor because
 * configuring a price is not when money moves (see `openTierModal`). This one
 * stops nothing. The host sets whatever price they like and saves the draft;
 * it only tells them, at the moment they type an amount, about a requirement
 * they would otherwise meet for the first time as a save failure.
 *
 * ── What it cost to not have it ────────────────────────────────────────────
 *
 * A community leader setting up ticket tiers hit the server's gate five times
 * in eight minutes and wrote in asking why creating an event was broken. The
 * server's refusal is now a 400 carrying its message, so the save at least
 * explains itself — but the earliest honest place to say it is here, beside
 * the field that triggers it.
 *
 * ── It renders only on a PROVEN answer ─────────────────────────────────────
 *
 * Callers must pass `known` through from `useStripeStatus`. A failed or
 * forbidden status request leaves `connected: false`, and showing this on
 * that basis would tell a host their community has no payment account because
 * THEY were not allowed to ask — the exact confusion documented on
 * `StripeStatus.known`.
 *
 * Whose account it names is deliberately left vague: the config context
 * points `stripeStatusUrl` and `stripeConnectUrl` at the community's account
 * in the admin app and at the member's own in the community app, and the copy
 * has to be true in both. Saying "the community's" here would be wrong in one
 * of them — and offering a link that cannot clear the condition it describes
 * is the second mistake the removed gate made.
 */
export function StripePayoutNotice({
  communityTag,
  known,
  connected,
}: {
  communityTag: string;
  known: boolean;
  connected: boolean;
}) {
  const { stripeConnectUrl } = useEventManagementConfig();
  if (!known || connected) return null;
  return (
    <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200/70">
      <p className="text-[12px] font-medium text-amber-900">
        No payment account connected yet
      </p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-amber-800">
        You can set a price now, but a paid event cannot be saved until a Stripe
        account is connected, because there would be nowhere to pay the money
        out. Free tiers are unaffected.
      </p>
      <a
        href={stripeConnectUrl(communityTag)}
        className="mt-1.5 inline-block text-[12px] font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950"
      >
        Connect Stripe
      </a>
    </div>
  );
}

/**
 * Modal shown in place of paid-tier editing when the community hasn't
 * connected Stripe yet. The connect-link target is supplied by the host
 * app via `stripeConnectUrl` in the config context — the admin app and
 * the community app point at different paths.
 */
export function StripeRequiredWarning({
  communityTag,
  onClose,
}: {
  communityTag: string;
  onClose: () => void;
}) {
  const { stripeConnectUrl } = useEventManagementConfig();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[120] text-zinc-900"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[420px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
            <rect x="1" y="4" width="22" height="16" rx="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </div>
        <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">Connect Stripe</h3>
        <p className="text-[13px] text-zinc-500 mb-1">
          This community doesn&apos;t have a payment account configured yet.
        </p>
        <p className="text-[13px] text-zinc-500 mb-5">
          We use Stripe to process payments. Connect or set up a Stripe account to start
          accepting payments. It usually takes less than 5 minutes.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer"
          >
            Cancel
          </button>
          <a
            href={stripeConnectUrl(communityTag)}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 no-underline cursor-pointer"
          >
            Connect Stripe
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
