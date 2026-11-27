/**
 * The wizard saves its WHOLE form into the draft and gets it back on resume.
 *
 * Impact Hub Porto's host (2026-11-26) filled an event, left it as a draft and
 * came back to its name and description only: the dates, the place, the ticket
 * and its price, and the photo she had uploaded were gone. The form is stubbed
 * here to report what it is seeded with and to emit a full form, the way the
 * real one does on every change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ fake: null as any, initial: null as any }));

vi.mock("../components/EventForm", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return {
    EventForm: (props: any) => {
      h.initial = props.initialData ?? null;
      useEffect(() => { props.onChange?.(h.fake); }, []);
      return <div data-testid="event-form" />;
    },
  };
});

import { EventCreateWizard } from "../create-wizard/EventCreateWizard";
import type { EventCreateWizardTransport } from "../create-wizard/types";
import { DRAFT_FORM_VERSION } from "../create-wizard/draftForm";

const hrefs = {
  events: "/events", connectStripe: "/stripe", howItWorks: "/how", sellingGuide: "/guide", fullGuide: "/full",
  createAnother: "/events/new", viewEvent: (s: string) => `/events/${s}`, manageEvent: (s: string) => `/events/${s}/manage`,
  reviewListing: (s: string) => `/events/${s}/review`,
};

const START = new Date("2026-12-11T12:30:00.000Z");
const TIERS = [{ localId: "t1", name: "Padrão", description: "", price: "30", currency: "EUR", capacity: "60", isRecurring: false, recurringInterval: "monthly" }];
const LOCATIONS = [{ kind: "PHYSICAL", address: "Rua das Estrelas 143, 4150-762 Porto", isPrimary: true }];

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
    createEvent: vi.fn(async () => ({ ok: true as const, event: { id: "ev-1", slug: "x" } })),
    saveDonations: vi.fn(async () => {}),
    ...over,
  } as EventCreateWizardTransport;
}

function wizard(tr: EventCreateWizardTransport, draftId: string | null) {
  return (
    <EventCreateWizard
      community={{ tag: "impact-hub-porto", id: "c1", name: "Impact Hub Porto", memberFeeModel: "FLAT", memberRequireApproval: true }}
      transport={tr}
      navigation={{ hrefs, onDone: vi.fn() }}
      canCreateForCommunity={false}
      initialDrafts={[]}
      draftId={draftId}
    />
  );
}

beforeEach(() => {
  h.initial = null;
  h.fake = {
    name: "Food for Thought #2", description: "Talks and lunch", categoryId: null, subCategoryId: null,
    bannerUrl: "https://storage.example/cover.jpg", media: [], startDate: START, endDate: START,
    startTime: "12:30", endTime: "16:00", timezone: "Europe/Lisbon", physicalLocation: LOCATIONS[0].address,
    onlineUrl: "", locations: LOCATIONS, accessibility: "PUBLIC", requiresApproval: false, attendeeVisibility: "PUBLIC",
    viewTierIds: [], buyTierIds: [], tiers: TIERS, tags: [],
  };
  try { localStorage.setItem("us-first-time-creator-seen::impact-hub-porto::event", "1"); } catch { /* ignore */ }
});

describe("the draft keeps the whole form", () => {
  it("autosave sends the form: dates, the place, the ticket and its price, the photo", async () => {
    const tr = transport();
    render(wizard(tr, null));
    await waitFor(() => expect(tr.saveDraft).toHaveBeenCalled(), { timeout: 4000 });
    const [, snapshot] = (tr.saveDraft as any).mock.calls.at(-1);
    expect(snapshot.name).toBe("Food for Thought #2");
    expect(snapshot.form.v).toBe(DRAFT_FORM_VERSION);
    expect(snapshot.form.form.tiers).toEqual(TIERS);
    expect(snapshot.form.form.locations).toEqual(LOCATIONS);
    expect(snapshot.form.form.startDate).toBe(START.toISOString());
    expect(snapshot.form.form.bannerUrl).toBe("https://storage.example/cover.jpg");
    expect(snapshot.form.viewAccess).toEqual({ mode: "public", tierIds: [] });
  });

  it("resuming hands the form back everything the draft kept", async () => {
    const stored = {
      v: DRAFT_FORM_VERSION,
      form: { ...h.fake, startDate: START.toISOString(), endDate: START.toISOString() },
      viewAccess: { mode: "public", tierIds: [] },
      buyAccess: { mode: "public", tierIds: [] },
      packageId: null,
    };
    const tr = transport({
      getDraft: vi.fn(async () => ({ id: "d-1", name: "Food for Thought #2", draftStep: "commerce", communityId: null, draftForm: stored }) as any),
    });
    render(wizard(tr, "d-1"));
    await screen.findByTestId("event-form");
    await waitFor(() => expect(h.initial?.tiers).toEqual(TIERS));
    expect(h.initial.locations).toEqual(LOCATIONS);
    expect(h.initial.bannerUrl).toBe("https://storage.example/cover.jpg");
    expect(h.initial.startDate).toEqual(START);
  });
});
