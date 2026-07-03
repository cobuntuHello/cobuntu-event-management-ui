"use client";

import * as React from "react";

/**
 * The auth-injection contract between the shared event-management UI and
 * its consuming apps. Each app has its own way of computing the API base
 * URL, the Authorization header, and the path to its Stripe connect flow.
 * Rather than baking any of that into the shared components, we accept it
 * as React context.
 *
 * Wrap the event-management UI surface in `<EventManagementConfigProvider
 * value={...}>` in each app's root (or in the layout that contains the
 * /manage page).
 */
export interface EventManagementConfig {
  /**
   * Base URL of the Cobuntu API (no trailing slash), e.g. "https://api.cobuntu.com"
   * or "http://localhost:4000" in dev.
   */
  apiBaseUrl: string;

  /**
   * Returns the Authorization headers to attach to API requests. Called once
   * per request; should be cheap. Typically `{ Authorization: \`Bearer ${token}\` }`.
   * Return an empty object when no auth is available (the components will
   * still attempt the request and handle the 401).
   */
  authHeaders: () => Record<string, string>;

  /**
   * Builds the URL to send the host to when they need to connect Stripe.
   * The community-leader-facing admin app uses `/${communityTag}/connect-stripe`;
   * the host-facing community app may use a different path (e.g. the
   * `/c/${communityTag}/settings/payments` flow inside the community
   * storefront).
   */
  stripeConnectUrl: (communityTag: string) => string;

  /**
   * Optional override for the Stripe-status endpoint the paid-tier gate
   * hits. Defaults to
   * `${apiBaseUrl}/api/communities/${communityTag}/stripe/connected` — the
   * COMMUNITY's Stripe, used by the admin (community-leader) flow where the
   * community collects. The community app's member "host an event" flow
   * overrides this to the MEMBER's own Stripe
   * (`${apiBaseUrl}/api/users/me/stripe/status`), since paid member events
   * pay out to the member's Connect account. Must return a full URL and the
   * endpoint must respond `{ connected, chargesEnabled }`.
   */
  stripeStatusUrl?: (communityTag: string) => string;

  /**
   * Navigation callback used by components that take the host to
   * another page (e.g. AttendeesAndInvitationsSection's "Add Attendees"
   * + "Invite" buttons). Each app injects its own router — admin uses
   * Next.js `router.push`, community-app may use a different wrapper.
   *
   * Required from the moment AttendeesAndInvitationsSection is mounted.
   * Components that don't navigate ignore this field.
   */
  navigate: (path: string) => void;

  /**
   * Component slot for rendering user avatars. Each app has its own
   * style (admin uses a seeded-persona fallback; community-app may use
   * a different placeholder). Defaults to a minimal initials fallback
   * if not provided — components stay functional in a fresh consumer
   * without forcing them to wire this up just to render an empty list.
   *
   * Required-ish: optional in the type, but the AttendeesAndInvitationsSection
   * will use the built-in fallback if absent. Pass your app's component
   * to keep visual consistency with the rest of the surface.
   */
  UserAvatar?: React.ComponentType<{
    user: {
      name?: string | null;
      imageUrl?: string | null;
      profileImage?: string | null;
      usertag?: string | null;
      email?: string | null;
      id?: string | null;
    };
    className?: string;
  }>;
}

const Ctx = React.createContext<EventManagementConfig | null>(null);

export function EventManagementConfigProvider({
  value,
  children,
}: {
  value: EventManagementConfig;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Hook accessor used inside the shared components. Throws if a component
 * renders outside the provider — surfaces wiring mistakes loudly rather than
 * silently falling back to localhost.
 */
export function useEventManagementConfig(): EventManagementConfig {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useEventManagementConfig: missing <EventManagementConfigProvider value={...}>. " +
        "Wrap your event-management surface (e.g. the /manage layout) with the provider.",
    );
  }
  return ctx;
}

/**
 * Convenience: returns `{ "Content-Type": "application/json", ...auth }`.
 * Used for PUT/POST/DELETE bodies. Matches the legacy `jsonHeaders()` helper
 * shape each app used to define locally.
 */
export function useJsonHeaders(): () => Record<string, string> {
  const { authHeaders } = useEventManagementConfig();
  return React.useCallback(
    () => ({ "Content-Type": "application/json", ...authHeaders() }),
    [authHeaders],
  );
}

/**
 * Shared PUT helper for `/api/communities/:tag/events/:id`. Each sub-modal
 * uses this — pulls apiBaseUrl + json headers from context, throws with
 * the backend's error message on non-2xx.
 */
export function useUpdateEvent(): (
  communityTag: string,
  eventId: string,
  body: Record<string, unknown>,
) => Promise<any> {
  const { apiBaseUrl } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  return React.useCallback(
    async (communityTag, eventId, body) => {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${eventId}`,
        { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(body) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    [apiBaseUrl, jsonHeaders],
  );
}
