/**
 * EventCreateWizard as a host sees it: a transport, navigation and copy, and
 * nothing of the community app (embed-event-wizard plan, phase 2).
 *
 * The app's own characterisation suite pins the flow end to end against its
 * /api/* transport (cobuntu-community-app __tests__/event-create-wizard-
 * characterisation.test.tsx). This file pins what only the package adds:
 * the transport contract, extra steps, the copy fallback, in-place resume,
 * the portal/theme wiring and the stylesheets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({ fake: null as any, props: [] as any[] }));

vi.mock("../components/EventForm", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return {
    EventForm: (props: any) => {
      h.props.push(props);
      useEffect(() => { props.onChange?.(h.fake); }, []);
      return <div data-testid="event-form" data-page={props.page} data-initial-name={props.initialData?.name ?? ""} />;
    },
  };
});

import { EventCreateWizard } from "../create-wizard/EventCreateWizard";
import type { EventCreateWizardTransport, EventCreateWizardProps } from "../create-wizard/types";
import { createWizardTranslator, formatMessage } from "../create-wizard/i18n";
import { THEME_ADAPTER_CSS } from "../create-wizard/theme";

function fake(over: any = {}) {
  return {
    name: "Supper club", description: "", bannerUrl: "",
    startDate: new Date("2026-11-01T00:00:00Z"), endDate: new Date("2026-11-01T00:00:00Z"),
    startTime: "19:00", endTime: "22:00", timezone: "Europe/Lisbon",
    physicalLocation: "", onlineUrl: "", requiresApproval: false, attendeeVisibility: "PUBLIC",
    tiers: [{ name: "General", price: "0", capacity: null }], tags: [], categoryId: null, subCategoryId: null, ...over,
  };
}

function transport(over: Partial<EventCreateWizardTransport> = {}): EventCreateWizardTransport {
  return {
    listDrafts: vi.fn(async () => []),
    getDraft: vi.fn(async () => null),
    saveDraft: vi.fn(async () => ({ ok: true as const })),
    deleteDraft: vi.fn(async () => {}),
    myPackages: vi.fn(async () => []),
    stripeStatus: vi.fn(async () => ({ connected: true, chargesEnabled: true })),
    permissions: vi.fn(async () => ({ eventsCreate: false })),
    categories: vi.fn(async () => []),
    tiers: vi.fn(async () => []),
    searchTags: vi.fn(async () => []),
    createTag: vi.fn(async (name: string) => ({ id: "t", name })),
    createEvent: vi.fn(async () => ({ ok: true as const, event: { id: "ev-1", slug: "supper-club" } })),
    saveDonations: vi.fn(async () => {}),
    ...over,
  };
}

const hrefs = {
  events: "/events", connectStripe: "/stripe", howItWorks: "/how", sellingGuide: "/guide", fullGuide: "/full",
  createAnother: "/events/new", viewEvent: (s: string) => `/events/${s}`, manageEvent: (s: string) => `/events/${s}/manage`,
  reviewListing: (s: string) => `/events/${s}/review`,
};

function renderWizard(over: Partial<EventCreateWizardProps> = {}) {
  const tr = (over.transport as EventCreateWizardTransport) ?? transport();
  const navigate = vi.fn();
  const onDone = vi.fn();
  const utils = render(
    <EventCreateWizard
      community={{ tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true }}
      transport={tr}
      navigation={{ hrefs, navigate, onDone }}
      {...over}
    />,
  );
  return { ...utils, tr, navigate, onDone };
}

const buttons = () => screen.getAllByRole("button").map((b) => b.textContent ?? "");
function press(label: string) {
  const b = screen.getAllByRole("button").find((x) => x.textContent === label);
  if (!b) throw new Error(`no "${label}"; have ${JSON.stringify(buttons())}`);
  fireEvent.click(b);
}
function railLabel() {
  const bar = screen.queryByRole("progressbar");
  return bar?.previousElementSibling?.querySelector("p")?.textContent?.split("·").pop()?.trim() ?? null;
}
function walk() {
  const seen = [railLabel()];
  for (let i = 0; i < 10 && buttons().includes("Next"); i++) { press("Next"); seen.push(railLabel()); }
  return seen;
}

beforeEach(() => {
  h.fake = fake();
  h.props = [];
  try { localStorage.setItem("us-first-time-creator-seen::orbis::event", "1"); } catch { /* ignore */ }
});

describe("missing-name validation doesn't double-show", () => {
  it("does not raise the page-level summary banner for a blank name (EventForm's own inline pill already says it)", async () => {
    renderWizard();
    await waitFor(() => expect(h.props.length).toBeGreaterThan(0));
    // EventForm itself is mocked out in this file (see the vi.mock above),
    // so this only pins EventCreateWizard's own half: it must not also raise
    // its page-level FormErrorBanner (role="alert") for the exact complaint
    // EventForm's own inline pill already covers. Clearing the name through
    // the same onChange path EventForm would use.
    h.props.at(-1).onChange(fake({ name: "" }));
    press("Next");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still raises the summary banner for a details-step problem with no inline equivalent (name too long)", async () => {
    renderWizard();
    await waitFor(() => expect(h.props.length).toBeGreaterThan(0));
    h.props.at(-1).onChange(fake({ name: "x".repeat(300) }));
    press("Next");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("transport", () => {
  it("asks for drafts and permissions when the host did not pass them, then opens", async () => {
    const { tr } = renderWizard();
    await screen.findByTestId("event-form");
    expect(tr.listDrafts).toHaveBeenCalledTimes(1);
    expect(tr.permissions).toHaveBeenCalledTimes(1);
    expect(tr.stripeStatus).toHaveBeenCalled();
    expect(tr.categories).toHaveBeenCalled();
    expect(tr.tiers).toHaveBeenCalled();
    expect(tr.myPackages).toHaveBeenCalled();
  });

  it("skips those calls when the host knows the answers", async () => {
    const { tr } = renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("event-form");
    expect(tr.listDrafts).not.toHaveBeenCalled();
    expect(tr.permissions).not.toHaveBeenCalled();
  });

  it("a leader per transport.permissions gets the ownership step", async () => {
    renderWizard({ transport: transport({ permissions: vi.fn(async () => ({ eventsCreate: true })) }) });
    await screen.findByTestId("event-form");
    expect(railLabel()).toBe("Who is hosting");
  });

  it("creates through transport.createEvent and reports to onDone", async () => {
    const { tr, onDone, navigate } = renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("event-form");
    walk();
    press("Create & Request Listing");
    await waitFor(() => expect(tr.createEvent).toHaveBeenCalledTimes(1));
    expect((tr.createEvent as any).mock.calls[0][0]).toMatchObject({
      name: "Supper club", ownership: "personal", communityId: "c1", publish: false, requestListing: true,
    });
    await screen.findByRole("status");
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({
      event: { id: "ev-1", slug: "supper-club", name: "Supper club" },
      // "unlisted", as the app has always resolved a personal create (it passes
      // requestedListing:false for personal ownership). Lifted as is.
      outcome: "unlisted", action: "createRequest", ownership: "personal", extraValues: {},
    }));
    press("View event");
    expect(navigate).toHaveBeenCalledWith("/events/supper-club");
  });

  it("a STRIPE_REQUIRED result shows the Stripe notice with the host's connect link", async () => {
    renderWizard({
      initialDrafts: [], canCreateForCommunity: false,
      transport: transport({ createEvent: vi.fn(async () => ({ ok: false as const, status: 400, code: "STRIPE_REQUIRED" })) }),
    });
    await screen.findByTestId("event-form");
    walk();
    press("Create");
    await screen.findByText("Connect Stripe to sell tickets");
    expect(screen.getByText("Connect Stripe").closest("a")).toHaveAttribute("href", "/stripe");
  });

  it("autosave goes through saveDraft and a 409 stops it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saveDraft = vi.fn(async (_id: string, _snap: Record<string, unknown>) => ({ ok: false as const, status: 409 }));
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, transport: transport({ saveDraft }) });
    await screen.findByTestId("event-form");
    await vi.advanceTimersByTimeAsync(1100);
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft.mock.calls[0][1]).toMatchObject({ name: "Supper club", draftStep: "details", communityId: null });
    h.props.at(-1).onChange(fake({ name: "Changed" }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("Cancel calls onCancel, else navigates to the events href", async () => {
    const onCancel = vi.fn();
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, navigation: { hrefs, onCancel } });
    await screen.findByTestId("event-form");
    press("Cancel");
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("ownershipMode personalOnly", () => {
  it("shows one card, no community option, and the perks note", async () => {
    renderWizard({
      canCreateForCommunity: true,
      ownershipMode: "personalOnly",
      community: {
        tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true,
        ownershipPerksNote: "20% off add-ons as a TEJÁ Circle member",
      },
    });
    await screen.findByTestId("event-form");
    expect(railLabel()).toBe("Who is hosting");
    // The community-ownership card is gone entirely, not just unselected.
    expect(screen.queryByText("Orbis")).toBeNull();
    expect(screen.getByText("20% off add-ons as a TEJÁ Circle member")).toBeTruthy();
  });

  it("still creates with ownership personal, same as a non-leader", async () => {
    const { tr, onDone } = renderWizard({
      initialDrafts: [], canCreateForCommunity: true, ownershipMode: "personalOnly",
    });
    await screen.findByTestId("event-form");
    walk();
    press("Create & List");
    await waitFor(() => expect(tr.createEvent).toHaveBeenCalledTimes(1));
    expect((tr.createEvent as any).mock.calls[0][0]).toMatchObject({ ownership: "personal" });
    await screen.findByRole("status");
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ ownership: "personal" }));
  });
});

describe("drafts without a host route", () => {
  it("resumes a draft in place from the Continue step", async () => {
    const getDraft = vi.fn(async () => ({ id: "d-1", name: "Half done", draftStep: "commerce", communityId: null }));
    renderWizard({
      canCreateForCommunity: false,
      initialDrafts: [{ id: "d-1", kind: "event", name: "Half done", draftStep: "commerce", updatedAt: new Date().toISOString(), communityId: null }],
      transport: transport({ getDraft }),
    });
    expect(railLabel()).toBe("Continue");
    fireEvent.click(screen.getByText("Half done"));
    const form = await screen.findByTestId("event-form");
    await waitFor(() => expect(getDraft).toHaveBeenCalledWith("d-1"));
    await waitFor(() => expect(screen.getByTestId("event-form")).toHaveAttribute("data-initial-name", "Half done"));
    expect(railLabel()).toBe("Pricing");
    expect(form).toBeTruthy();
  });

  it("uses navigation.onResumeDraft when the host has its own route", async () => {
    const onResumeDraft = vi.fn();
    renderWizard({
      canCreateForCommunity: false,
      initialDrafts: [{ id: "d-1", kind: "event", name: "Half done", draftStep: null, updatedAt: new Date().toISOString(), communityId: null }],
      navigation: { hrefs, onResumeDraft },
    });
    fireEvent.click(screen.getByText("Half done"));
    await waitFor(() => expect(onResumeDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "d-1" })));
  });
});

describe("extra steps", () => {
  const extraSteps = [
    {
      id: "about-you",
      label: "About you",
      title: "Tell us about you",
      subtitle: "So the house can reach you.",
      render: ({ value, onChange }: any) => (
        <input aria-label="Phone" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ),
      validate: (v: unknown) => (v ? null : "A phone number is required"),
    },
  ];

  it("appear on the rail after the last Cobuntu step, block Next until valid, and reach onDone", async () => {
    const { tr, onDone } = renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps });
    await screen.findByTestId("event-form");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-label", "Step 1 of 5");
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Commission", "About you"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tell us about you");

    press("Create");
    expect(await screen.findByRole("alert")).toHaveTextContent("A phone number is required");
    expect(tr.createEvent).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+351 900" } });
    press("Create");
    await waitFor(() => expect(tr.createEvent).toHaveBeenCalledTimes(1));
    // Never sent to Cobuntu.
    expect(JSON.stringify((tr.createEvent as any).mock.calls[0][0])).not.toContain("+351");
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ extraValues: { "about-you": "+351 900" } })));
  });
});

describe("extraStepsAfter", () => {
  const extraSteps = [{ id: "about-you", label: "About you", title: "Tell us about you", render: () => <div /> }];

  it("puts the extra steps right after the named step", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, extraStepsAfter: "details" });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "About you", "Pricing", "Policies & access", "Commission"]);
  });

  it("falls back to the end when the step is not in the flow", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, extraStepsAfter: "nope" });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Commission", "About you"]);
  });
});

/**
 * A venue's steps do not all belong in one place: the room and the date come
 * early because everything after is priced off them, while a review of what
 * was chosen can only be last. `after` splits the block; `extraStepsAfter`
 * still carries whatever does not name its own place.
 */
describe("per-step placement", () => {
  const step = (id: string, label: string, after?: string) => ({ id, label, title: label, after, render: () => <div /> });

  it("places a step after the one it names, and leaves the rest on the block anchor", async () => {
    renderWizard({
      initialDrafts: [], canCreateForCommunity: false, extraStepsAfter: "details",
      extraSteps: [step("about-you", "About you"), step("review", "Review", "end")],
    });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "About you", "Pricing", "Policies & access", "Commission", "Review"]);
  });

  it("'end' goes last even with no block anchor at all", async () => {
    renderWizard({
      initialDrafts: [], canCreateForCommunity: false,
      extraSteps: [step("review", "Review", "end"), step("about-you", "About you")],
    });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Commission", "About you", "Review"]);
  });

  it("pins to a named built-in step", async () => {
    renderWizard({
      initialDrafts: [], canCreateForCommunity: false,
      extraSteps: [step("when", "When", "details")],
    });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "When", "Pricing", "Policies & access", "Commission"]);
  });

  it("an `after` naming a step this flow does not have travels with the block instead of vanishing", async () => {
    renderWizard({
      initialDrafts: [], canCreateForCommunity: false, extraStepsAfter: "details",
      extraSteps: [step("review", "Review", "nowhere")],
    });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "Review", "Pricing", "Policies & access", "Commission"]);
  });
});

describe("hideArrangementStep", () => {
  const extraSteps = [{ id: "review", label: "Review", title: "Review", after: "end", render: () => <div /> }];

  it("drops the commission screen when there is nothing to choose", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, hideArrangementStep: true });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Review"]);
  });

  it("keeps it when a lone package is pre-selected, since the flag only removes a dead screen", async () => {
    const tr = transport();
    (tr.myPackages as any).mockResolvedValue([{ id: "p1", name: "Circle", rate: 20 }]);
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, hideArrangementStep: true, transport: tr });
    await screen.findByTestId("event-form");
    await waitFor(() => expect(tr.myPackages).toHaveBeenCalled());
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Review"]);
  });

  /*
   * The one that matters. The wizard auto-selects a LONE package, so without
   * the step `needsPackage` stays false and submit works. With two it stays
   * true forever, and hiding the only screen that could satisfy it would
   * disable the submit button with no way out. The step wins over the flag.
   */
  it("REFUSES to hide a real choice, because that would block submit with no way to satisfy it", async () => {
    const tr = transport();
    (tr.myPackages as any).mockResolvedValue([
      { id: "p1", name: "Circle", rate: 20 },
      { id: "p2", name: "Guest", rate: 30 },
    ]);
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, hideArrangementStep: true, transport: tr });
    await screen.findByTestId("event-form");
    // walk() ADVANCES the wizard, so it is spent once: wait for the packages
    // to land first, then walk exactly once.
    await waitFor(() => expect(tr.myPackages).toHaveBeenCalled());
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Commission", "Review"]);
  });
});

describe("the commission step", () => {
  async function toCommissionStep(over: Partial<EventCreateWizardProps> = {}) {
    const utils = renderWizard({ initialDrafts: [], canCreateForCommunity: false, ...over });
    await screen.findByTestId("event-form");
    for (let i = 0; i < 10 && railLabel() !== "Commission"; i++) press("Next");
    return utils;
  }

  it("has no toggle — the commission is always shown, never a decision", async () => {
    await toCommissionStep({
      transport: transport({ myPackages: vi.fn(async () => [{ id: "pk1", name: "Standard", description: null, rate: 10 }]) }),
    });
    await screen.findByText("Standard");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  // Multiple packages, so PackagePicker takes its split-breakdown path
  // rather than the single-package combined sentence.
  const twoPackages = vi.fn(async () => [
    { id: "pk1", name: "Standard", description: null, rate: 10 },
    { id: "pk2", name: "Featured", description: null, rate: 15 },
  ]);

  it("shows every community package, plus Cobuntu's and Stripe's cuts split apart", async () => {
    await toCommissionStep({
      transport: transport({ myPackages: twoPackages }),
      community: { tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true, platformFeeRate: 0.025 },
    });
    await screen.findByText("Standard");
    expect(screen.getByText("Featured")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByText("Card processing")).toBeInTheDocument();
    expect(screen.getByText("Cobuntu")).toBeInTheDocument();
    // 2.5% platform rate, same 1.5%/€0.25 processing split PackagePicker always uses.
    expect(screen.getByText("1.5% + €0.25")).toBeInTheDocument();
    expect(screen.getByText("2.5% + €0.05")).toBeInTheDocument();
  });

  it("zeroes Cobuntu's cut when the host reports a premium community (platformFeeRate 0)", async () => {
    await toCommissionStep({
      transport: transport({ myPackages: twoPackages }),
      community: { tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true, platformFeeRate: 0 },
    });
    await screen.findByText("Standard");
    expect(screen.getByText("0% + €0.05")).toBeInTheDocument();
  });

  it("still shows the no-packages note when the community has published none", async () => {
    await toCommissionStep();
    expect(screen.getByText(/has not published terms for your tier/)).toBeInTheDocument();
  });

  it("shows Cobuntu's and Stripe's cuts even with no community package published", async () => {
    // Regression: this step used to take a separate branch for the
    // zero-packages case that rendered only the note above and never
    // reached PackagePicker, so a host on a tier with no published terms
    // saw nothing about what they would actually be charged.
    await toCommissionStep({
      community: { tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true, platformFeeRate: 0.025 },
    });
    expect(screen.getByText("Card processing")).toBeInTheDocument();
    expect(screen.getByText("Cobuntu")).toBeInTheDocument();
    expect(screen.getByText("1.5% + €0.25")).toBeInTheDocument();
    expect(screen.getByText("2.5% + €0.05")).toBeInTheDocument();
  });

  it("names the community as reviewer when the community requires approval", async () => {
    await toCommissionStep({
      transport: transport({ myPackages: twoPackages }),
      community: { tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true, platformFeeRate: 0.025 },
    });
    expect(await screen.findByText("Orbis reviews it")).toBeInTheDocument();
  });

  it("says it's approved automatically when the community does not require approval", async () => {
    await toCommissionStep({
      transport: transport({ myPackages: twoPackages }),
      community: { tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: false, platformFeeRate: 0.025 },
    });
    expect(await screen.findByText("Automatically approved")).toBeInTheDocument();
  });

  it("totals the selected package's rate and Cobuntu's cut into a 'you keep' line", async () => {
    await toCommissionStep({
      transport: transport({ myPackages: vi.fn(async () => [{ id: "pk1", name: "Standard", description: null, rate: 10 }]) }),
      community: { tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true, platformFeeRate: 0.025 },
    });
    // 100 - 10 (package) - 4 (Cobuntu all-in: 2.5% net + 1.5% processing) = 86.
    expect(await screen.findByText("You keep, per sale")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
  });
});

/**
 * A compound step ("a day, a length and a start time") is better served by a
 * button that is not ready yet than by one that can be pressed to be told the
 * start times are missing while the start times fill the screen.
 */
describe("disableNextOnInvalidExtraStep", () => {
  const extraSteps = [
    {
      id: "when", label: "When", title: "When is it?",
      render: ({ value, onChange }: any) => (
        <input aria-label="Day" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ),
      validate: (v: unknown) => (v ? null : "Pick a day."),
    },
  ];
  const nextBtn = () => screen.getAllByRole("button").find((b) => b.textContent === "Next") as HTMLButtonElement;

  it("greys Next out while the step is unanswered, and enables it once it is", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, extraStepsAfter: "details", disableNextOnInvalidExtraStep: true });
    await screen.findByTestId("event-form");
    // step one is a built-in: untouched by this flag
    expect(nextBtn()).not.toBeDisabled();
    press("Next");
    await screen.findByLabelText("Day");
    expect(nextBtn()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-11-25" } });
    expect(nextBtn()).not.toBeDisabled();
  });

  it("leaves the built-in steps alone, so a details form never sits behind a dead button", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, extraStepsAfter: "details", disableNextOnInvalidExtraStep: true });
    await screen.findByTestId("event-form");
    expect(nextBtn()).not.toBeDisabled();
  });

  it("without the flag Next stays pressable and answers with an error, as before", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, extraSteps, extraStepsAfter: "details" });
    await screen.findByTestId("event-form");
    press("Next");
    await screen.findByLabelText("Day");
    expect(nextBtn()).not.toBeDisabled();
    press("Next");
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a day.");
  });
});

/**
 * EventForm seeds a "Standard" tier so Pricing is never a blank screen, then
 * deliberately drops it from what it emits if the host never touches it
 * (fake({ tiers: [] }) is exactly that emission) -- that is how a plain free
 * RSVP event with no tier concept gets created, and the backend treats
 * `tiers.length === 0` as "this is a free event" throughout, not as missing
 * input. An "add at least one tier" gate on top of that contradicted the
 * form it was gating and trapped a host who had every reason to think the
 * visible Standard row was enough.
 */
describe("a host who never touches the seeded Standard tier", () => {
  it("is not blocked leaving Pricing", async () => {
    h.fake = fake({ tiers: [] });
    renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("event-form");
    expect(walk()).toEqual(["Details", "Pricing", "Policies & access", "Commission"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("can still create the event", async () => {
    h.fake = fake({ tiers: [] });
    const { tr } = renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("event-form");
    walk();
    press("Create");
    await waitFor(() => expect(tr.createEvent).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("copy", () => {
  it("defaults to English without a host t", async () => {
    renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("event-form");
    expect(screen.getByText("About your event")).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
  });

  it("reads every string through a host t, fully qualified", async () => {
    const t = vi.fn((key: string) => `«${key}»`);
    renderWizard({ initialDrafts: [], canCreateForCommunity: false, copy: { t } });
    await screen.findByTestId("event-form");
    expect(screen.getByText("«eventsUi.createEventClient.stepDetailsTitle»")).toBeInTheDocument();
    expect(screen.getByText("«shared.howItWorksButton.label»")).toBeInTheDocument();
  });

  it("formats ICU plural/select and rich tags", () => {
    expect(formatMessage("{count, plural, one {# day ago} other {# days ago}}", { count: 1 })).toBe("1 day ago");
    expect(formatMessage("{count, plural, one {# day ago} other {# days ago}}", { count: 3 })).toBe("3 days ago");
    expect(formatMessage("{kind, select, event {Host {n}} other {List}}", { kind: "event", n: "it" })).toBe("Host it");
    const t = createWizardTranslator();
    expect(t("eventsUi.ownership.communityCobuntuFee", { rate: "5%" })).toBe("Cobuntu takes <b>5%</b>");
    expect(t("eventsUi.createEventClient.nope")).toBe("eventsUi.createEventClient.nope");
  });
});

describe("theme and portals", () => {
  it("without a theme: no themed classes, and portals stay inline unless asked for body", async () => {
    const { container } = renderWizard({ initialDrafts: [], canCreateForCommunity: false });
    await screen.findByTestId("event-form");
    const root = container.querySelector(".cbt-event-wizard")!;
    expect(root.className).toBe("cbt-event-wizard");
    expect(root.querySelector(":scope > .cbt-wizard-portal")).not.toBeNull();
  });

  it("portal=body renders no portal root (the community app)", async () => {
    const { container } = renderWizard({ initialDrafts: [], canCreateForCommunity: false, portal: "body" });
    await screen.findByTestId("event-form");
    expect(container.querySelector(".cbt-wizard-portal")).toBeNull();
  });

  it("a theme sets the variables on the root and themes the portal root", async () => {
    const { container } = renderWizard({
      initialDrafts: [], canCreateForCommunity: false,
      theme: { brandColor: "#0a7", textColor: "#222", bgColor: "#fffaf0", headingFont: "Fraunces" },
    });
    await screen.findByTestId("event-form");
    const root = container.querySelector(".cbt-event-wizard") as HTMLElement;
    expect(root).toHaveClass("cbt-event-wizard--themed");
    expect(root.style.getPropertyValue("--brand-color")).toBe("#0a7");
    expect(root.style.getPropertyValue("--heading-font")).toBe("Fraunces");
    expect(root.querySelector(".cbt-wizard-portal")).toHaveClass("themed-event-form");
  });
});

describe("stylesheets", () => {
  const dir = join(__dirname, "../create-wizard");
  const norm = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();

  it("theme.css carries the adapter rules the wizard injects", () => {
    const css = norm(readFileSync(join(dir, "theme.css"), "utf8"));
    const rules = norm(THEME_ADAPTER_CSS).split("}").map((r) => r.trim()).filter(Boolean);
    for (const r of rules) expect(css).toContain(r + " }");
  });

  it("the wizard and its parts import nothing from next/*", () => {
    for (const f of readdirSync(dir)) {
      if (!/\.tsx?$/.test(f)) continue;
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/from ["']next\//);
    }
    expect(readFileSync(join(__dirname, "../ui/markdown-editor.tsx"), "utf8")).not.toMatch(/from ["']next\//);
  });

  it("the prebuilt event-wizard.css is scoped and covers the wizard's own classes", () => {
    const css = readFileSync(join(__dirname, "../../dist/event-wizard.css"), "utf8");
    expect(css).not.toMatch(/@layer/);
    expect(css).not.toMatch(/(^|\n)\s*(html|body|:root)\s*[,{]/);
    for (const cls of ["max-w-2xl", "md\\:block", "fixed", "text-xl", "border-current\\/10", "max-md\\:pb-\\[calc\\(5rem\\+env\\(safe-area-inset-bottom\\)\\)\\]"]) {
      expect(css, cls).toContain(`.cbt-event-wizard .${cls}`);
    }
  });
});
