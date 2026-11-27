import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormNoticeBanner } from "../create-wizard/banners";
import { StripePayoutNotice } from "../components/stripe-status";
import { renderWithConfig } from "./test-utils";

/**
 * CONNECT STRIPE IN A NEW TAB (0.109.2). Under the create wizard's
 * `navigation.connectStripeInNewTab`, every "Connect Stripe" link the form
 * shows opens a new tab, so following one never leaves the form (the dialog
 * on Paid entry is pinned in EventForm.presets.test.tsx). Off by default.
 */
describe("Connect Stripe links in a new tab", () => {
  it("the wizard's notice banner opens its action in a new tab when asked", () => {
    render(<FormNoticeBanner title="Connect Stripe to sell tickets" body="b" actionHref="/account/payouts/onboard" actionLabel="Connect Stripe" actionNewTab />);
    const link = screen.getByRole("link", { name: /Connect Stripe/ });
    expect(link).toHaveAttribute("href", "/account/payouts/onboard");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });

  it("the banner keeps the same tab by default", () => {
    render(<FormNoticeBanner title="t" body="b" actionHref="/stripe" actionLabel="Connect Stripe" />);
    expect(screen.getByRole("link", { name: /Connect Stripe/ })).not.toHaveAttribute("target");
  });

  it("the price editor's payout notice follows the config's stripeConnectNewTab", () => {
    renderWithConfig(<StripePayoutNotice communityTag="c-1" known connected={false} />, {
      config: { stripeConnectUrl: () => "/account/payouts/onboard", stripeConnectNewTab: true },
    });
    const link = screen.getByRole("link", { name: /Connect Stripe/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });

  it("the payout notice keeps the same tab by default", () => {
    renderWithConfig(<StripePayoutNotice communityTag="c-1" known connected={false} />);
    expect(screen.getByRole("link", { name: /Connect Stripe/ })).not.toHaveAttribute("target");
  });
});
