"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useEventManagementConfig } from "../config";

export interface StripeStatus {
  connected: boolean;
  chargesEnabled: boolean;
  loading: boolean;
}

/**
 * Caches Stripe status per communityTag for the lifetime of the page so
 * re-mounts (e.g. opening + closing the price modal repeatedly) don't
 * re-hit the API. Matches the legacy stripeCache behavior.
 */
const stripeCache = new Map<string, { connected: boolean; chargesEnabled: boolean }>();

export function useStripeStatus(communityTag: string, opts: { enabled?: boolean } = {}): StripeStatus {
  const { apiBaseUrl, authHeaders, stripeStatusUrl } = useEventManagementConfig();
  const enabled = opts.enabled ?? true;
  const [status, setStatus] = React.useState<StripeStatus>({
    connected: false,
    chargesEnabled: false,
    loading: enabled,
  });

  React.useEffect(() => {
    if (!enabled) {
      setStatus({ connected: false, chargesEnabled: false, loading: false });
      return;
    }
    if (!communityTag) {
      setStatus({ connected: false, chargesEnabled: false, loading: false });
      return;
    }
    const cached = stripeCache.get(communityTag);
    if (cached) {
      setStatus({ ...cached, loading: false });
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
          setStatus({ ...result, loading: false });
        } else {
          setStatus({ connected: false, chargesEnabled: false, loading: false });
        }
      } catch {
        setStatus({ connected: false, chargesEnabled: false, loading: false });
      }
    })();
  }, [communityTag, apiBaseUrl, authHeaders, stripeStatusUrl, enabled]);

  return status;
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
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 text-zinc-900"
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
