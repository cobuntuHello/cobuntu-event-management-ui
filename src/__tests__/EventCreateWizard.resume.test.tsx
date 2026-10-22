/**
 * Opening a draft must never stick on "Opening your draft...".
 *
 * The resume run is keyed by the DRAFT, not by the effect's lifetime: StrictMode's
 * mount/cleanup/mount, Fast Refresh, and a host re-rendering with a new
 * draftStepFromUrl (Next syncs replaceState into useSearchParams) all clean the
 * effect up while getDraft is in flight. The old guard (a boolean ref set on the
 * first run) cancelled that only run and bailed on the re-run, so the pending
 * flag was never cleared.
 */
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ fake: null as any }));

vi.mock("../components/EventForm", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return {
    EventForm: (props: any) => {
      useEffect(() => { props.onChange?.(h.fake); }, []);
      return <div data-testid="event-form" data-initial-name={props.initialData?.name ?? ""} />;
    },
  };
});

import { EventCreateWizard } from "../create-wizard/EventCreateWizard";
import type { EventCreateWizardTransport, EventCreateWizardProps } from "../create-wizard/types";

const hrefs = {
  events: "/events", connectStripe: "/stripe", howItWorks: "/how", sellingGuide: "/guide", fullGuide: "/full",
  createAnother: "/events/new", viewEvent: (s: string) => `/events/${s}`, manageEvent: (s: string) => `/events/${s}/manage`,
  reviewListing: (s: string) => `/events/${s}/review`,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const ROW = { id: "d-1", name: "Half done", draftStep: "commerce", communityId: null };

function transport(getDraft: EventCreateWizardTransport["getDraft"]): EventCreateWizardTransport {
  return {
    listDrafts: vi.fn(async () => []),
    getDraft,
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
  } as EventCreateWizardTransport;
}

function tree(tr: EventCreateWizardTransport, over: Partial<EventCreateWizardProps> = {}, strict = false) {
  const el = (
    <EventCreateWizard
      community={{ tag: "orbis", id: "c1", name: "Orbis", memberFeeModel: "FLAT", memberRequireApproval: true }}
      transport={tr}
      navigation={{ hrefs, onDone: vi.fn() }}
      canCreateForCommunity={false}
      initialDrafts={[]}
      draftId="d-1"
      {...over}
    />
  );
  return strict ? <StrictMode>{el}</StrictMode> : el;
}

const opened = () => expect(screen.getByTestId("event-form")).toHaveAttribute("data-initial-name", "Half done");

beforeEach(() => {
  h.fake = {
    name: "Half done", description: "", bannerUrl: "", startDate: new Date(), endDate: new Date(),
    startTime: "19:00", endTime: "22:00", timezone: "Europe/Lisbon", physicalLocation: "", onlineUrl: "",
    requiresApproval: false, attendeeVisibility: "PUBLIC", tiers: [], tags: [], categoryId: null, subCategoryId: null,
  };
  try { localStorage.setItem("us-first-time-creator-seen::orbis::event", "1"); } catch { /* ignore */ }
});

describe("resuming a draft never sticks", () => {
  it("opens under StrictMode with a slow getDraft", async () => {
    const d = deferred<any>();
    const getDraft = vi.fn(() => d.promise);
    render(tree(transport(getDraft), {}, true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => { d.resolve(ROW); });
    await waitFor(opened);
  });

  it("opens when draftStepFromUrl changes while getDraft is in flight", async () => {
    const d = deferred<any>();
    const tr = transport(vi.fn(() => d.promise));
    const { rerender } = render(tree(tr, { draftStepFromUrl: null }));
    rerender(tree(tr, { draftStepFromUrl: "details" }));
    await act(async () => { d.resolve(ROW); });
    await waitFor(opened);
  });

  it("opens when the host's leader flag flips while getDraft is in flight", async () => {
    const d = deferred<any>();
    const tr = transport(vi.fn(() => d.promise));
    const { rerender } = render(tree(tr, { canCreateForCommunity: false }));
    rerender(tree(tr, { canCreateForCommunity: true }));
    await act(async () => { d.resolve(ROW); });
    await waitFor(opened);
  });

  it("fetches the draft once even when the effect re-runs", async () => {
    const getDraft = vi.fn(async (_id: string) => ROW as any);
    const tr = transport(getDraft);
    const { rerender } = render(tree(tr, {}, true));
    rerender(tree(tr, { draftStepFromUrl: "details" }, true));
    await waitFor(opened);
    expect(new Set(getDraft.mock.calls.map((c) => c[0]))).toEqual(new Set(["d-1"]));
  });

  it("opens an empty wizard when the draft cannot be read", async () => {
    const getDraft = vi.fn(async () => { throw new Error("boom"); });
    render(tree(transport(getDraft as any), {}, true));
    await waitFor(() => expect(screen.getByTestId("event-form")).toBeTruthy());
  });

  it("opens an empty wizard when interpreting the row throws", async () => {
    // communityId getter throws inside draftOwnership: must not leave it pending.
    const bad = { id: "d-1", draftStep: null, get communityId(): never { throw new Error("odd row"); } };
    render(tree(transport(vi.fn(async () => bad as any)), {}, true));
    await waitFor(() => expect(screen.getByTestId("event-form")).toBeTruthy());
  });

  it("does not set state after a real unmount", async () => {
    const d = deferred<any>();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(tree(transport(vi.fn(() => d.promise))));
    unmount();
    await act(async () => { d.resolve(ROW); });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
