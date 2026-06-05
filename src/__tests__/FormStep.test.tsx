import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormStep } from "../components/PriceEditModal/steps/FormStep";
import { FooterSlotContext } from "../components/PriceEditModal/footer-slot";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";
import { renderWithConfig, mockFetch } from "./test-utils";

function makeTier(overrides: Partial<DraftTier> = {}): DraftTier {
  return {
    ...blankTier("EUR", 1),
    id: "tier-1",
    name: "GA",
    price: "10",
    currency: "EUR",
    ...overrides,
  };
}

/**
 * Harness that mirrors the modal's footer slot. FormStep portals its
 * primary actions (Add question / Page break / Use default) into the
 * FooterSlotContext node, so the test must provide one for those buttons
 * to render — exactly as PriceEditModal does in production.
 */
function FormHarness(props: React.ComponentProps<typeof FormStep>) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <FooterSlotContext.Provider value={slot}>
      <FormStep {...props} />
      <div data-testid="footer-slot" ref={setSlot} />
    </FooterSlotContext.Provider>
  );
}

function renderForm(props: Partial<React.ComponentProps<typeof FormStep>> = {}) {
  return renderWithConfig(
    <FormHarness
      t={makeTier()}
      communityTag="c-1"
      showToast={() => {}}
      {...props}
    />,
  );
}

describe("FormStep — gates", () => {
  it("renders the 'Save tier first' hint for unsaved drafts", () => {
    renderForm({ t: makeTier({ id: undefined }) });
    expect(screen.getByText(/Save tier first/i)).toBeInTheDocument();
  });

  it("does not hit the network for unsaved drafts", () => {
    const fetchFn = mockFetch([]);
    renderForm({ t: makeTier({ id: undefined }) });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("FormStep — list view", () => {
  beforeEach(() => {
    mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        status: 404,
        body: {},
      },
    ]);
  });

  it("shows the empty-state Add buttons", async () => {
    renderForm();
    // The empty-state CTA is the discriminator — "No questions yet."
    // appears both in the header status and in the empty card, so query
    // by the button instead.
    expect(
      await screen.findByRole("button", { name: /Add question/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Use default/i }),
    ).toBeInTheDocument();
  });

  it("renders primary actions in the footer slot, not in the body", async () => {
    renderForm();
    const slot = await screen.findByTestId("footer-slot");
    // Empty state → Use default + Add question are portaled into the footer.
    expect(within(slot).getByRole("button", { name: /Use default/i })).toBeInTheDocument();
    expect(within(slot).getByRole("button", { name: /Add question/i })).toBeInTheDocument();
    // The empty-state card itself carries NO buttons anymore — just copy.
    expect(screen.getByText(/Use the footer to start/i)).toBeInTheDocument();
  });

  it("swaps footer actions to Page break + Question once the form has fields", async () => {
    mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        body: {
          formData: {
            fields: [
              { id: "f-1", type: "EMAIL", label: "Email", required: true, step: 0 },
            ],
            stepLabels: [""],
          },
        },
      },
    ]);
    renderForm();
    await screen.findAllByText("Email");
    const slot = screen.getByTestId("footer-slot");
    expect(within(slot).getByRole("button", { name: /\+ Page break/i })).toBeInTheDocument();
    expect(within(slot).getByRole("button", { name: /\+ Question/i })).toBeInTheDocument();
    // "Use default" only makes sense on an empty form.
    expect(within(slot).queryByRole("button", { name: /Use default/i })).not.toBeInTheDocument();
  });

  it("renders existing fields from the backend response", async () => {
    mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        body: {
          formData: {
            fields: [
              { id: "f-1", type: "SHORT_TEXT", label: "Name", required: true, step: 0 },
              { id: "f-2", type: "EMAIL", label: "Email", required: true, step: 0 },
            ],
            stepLabels: ["Sign up"],
          },
        },
      },
    ]);
    renderForm();
    // Wait for the loaded form to render — the field rows appear after the GET.
    await waitFor(() => expect(screen.getByText("Name")).toBeInTheDocument());
    // The EMAIL field shows "Email" both as a label and in the type meta
    // subtext, so query allows ≥1 match.
    expect(screen.getAllByText(/^Email$/).length).toBeGreaterThanOrEqual(1);
    // "Required" badge appears twice (one per field).
    expect(screen.getAllByText(/Required/).length).toBeGreaterThanOrEqual(1);
  });

  it("warns when no EMAIL field exists", async () => {
    mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        body: {
          formData: {
            fields: [
              { id: "f-1", type: "SHORT_TEXT", label: "Name", required: true, step: 0 },
            ],
            stepLabels: [""],
          },
        },
      },
    ]);
    renderForm();
    expect(
      await screen.findByText(/No Email field/i),
    ).toBeInTheDocument();
  });
});

describe("FormStep — Add Question sub-flow", () => {
  it("Add Question → picker → label editor → save → auto-PUT", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        status: 404,
        body: {},
      },
      {
        method: "PUT",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        body: {},
      },
    ]);

    renderForm();
    const addFirst = await screen.findByRole("button", {
      name: /Add question/i,
    });

    // Empty state CTA enters the type picker
    await user.click(addFirst);
    expect(
      await screen.findByRole("heading", { name: /Add a question/i }),
    ).toBeInTheDocument();

    // Pick "Short Text" — pushes into the field editor
    await user.click(screen.getByRole("button", { name: /Short Text/i }));
    expect(
      await screen.findByRole("heading", { name: /New question/i }),
    ).toBeInTheDocument();

    // Edit the label + confirm
    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;
    await user.clear(labelInput);
    await user.type(labelInput, "Full name");

    await user.click(screen.getByRole("button", { name: /Add question/i }));

    // PUT fired with the new field
    await waitFor(() => {
      const put = fetchFn.mock.calls.find(
        ([, init]: any) => (init?.method || "GET") === "PUT",
      );
      expect(put).toBeTruthy();
      const body = JSON.parse((put![1] as RequestInit).body as string);
      expect(body.fields).toHaveLength(1);
      expect(body.fields[0]).toMatchObject({
        type: "SHORT_TEXT",
        label: "Full name",
      });
    });

    // Back to list view — the new field shows up
    await waitFor(() =>
      expect(screen.getByText("Full name")).toBeInTheDocument(),
    );
  });

  it("Back arrow from the type picker returns to the list", async () => {
    const user = userEvent.setup();
    mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        status: 404,
        body: {},
      },
    ]);
    renderForm();
    const addFirst = await screen.findByRole("button", {
      name: /Add question/i,
    });
    await user.click(addFirst);
    expect(
      await screen.findByRole("heading", { name: /Add a question/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("Back to form fields"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Add question/i }),
      ).toBeInTheDocument(),
    );
  });
});

describe("FormStep — Use default seed", () => {
  it("Use default seeds Name + Email and PUTs immediately", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        status: 404,
        body: {},
      },
      {
        method: "PUT",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        body: {},
      },
    ]);
    renderForm();
    await user.click(await screen.findByRole("button", { name: /Use default/i }));
    await waitFor(() => {
      const put = fetchFn.mock.calls.find(
        ([, init]: any) => (init?.method || "GET") === "PUT",
      );
      expect(put).toBeTruthy();
      const body = JSON.parse((put![1] as RequestInit).body as string);
      expect(body.fields.map((f: any) => f.type)).toEqual([
        "SHORT_TEXT",
        "EMAIL",
      ]);
    });
  });
});

describe("FormStep — concurrent save race", () => {
  // Regression: every mutation auto-fires a PUT. Two rapid mutations
  // could land two PUTs in flight; the second's body was built from
  // state the first hadn't returned for yet, and the responses arrived
  // out of order — the second-issued (but first-resolved) PUT clobbered
  // the first-issued (but second-resolved) PUT's payload.
  //
  // The fix coalesces: while a PUT is in flight, subsequent mutations
  // stash their latest snapshot, and the in-flight call replays the
  // stash in its finally block. End-state must reflect the LAST user
  // intent — and only one extra request fires regardless of how many
  // mutations queued up.
  it("coalesces overlapping persist calls so the last intent wins", async () => {
    const user = userEvent.setup();
    // Hang the first PUT until we manually release it.
    let firstResolve: ((r: Response) => void) | null = null;
    const putBodies: string[] = [];
    let putCount = 0;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "GET" && /\/api\/communities\/c-1\/tiers\/tier-1\/form$/.test(url)) {
        return new Response("{}", { status: 404 });
      }
      if (method === "PUT" && /\/api\/communities\/c-1\/tiers\/tier-1\/form$/.test(url)) {
        putBodies.push(init?.body as string);
        putCount += 1;
        if (putCount === 1) {
          // Hang the first PUT so the second mutation lands while
          // it's in flight.
          return new Promise<Response>((r) => { firstResolve = r; });
        }
        return new Response("{}", { status: 200 });
      }
      throw new Error(`Unmocked: ${method} ${url}`);
    });
    global.fetch = fetchFn as unknown as typeof fetch;

    renderForm();

    // First mutation: seed Name + Email via the empty-state CTA.
    const useDefault = await screen.findByRole("button", { name: /Use default/i });
    await user.click(useDefault);

    // While the first PUT is hanging, fire a second mutation: add a
    // page break with a label. Without the coalesce guard the second
    // mutation would PUT immediately and race the first.
    await user.click(screen.getByRole("button", { name: /\+ Page break/i }));
    const labelInput = screen.getByPlaceholderText(/Tell us about your business/) as HTMLInputElement;
    await user.type(labelInput, "Step 2");
    await user.click(screen.getByRole("button", { name: /Add page break/i }));

    // Only the first PUT has fired so far — the second is queued.
    expect(putBodies).toHaveLength(1);

    // Release the first PUT → the queued snapshot replays.
    firstResolve!(new Response("{}", { status: 200 }));

    // After replay, exactly one additional PUT must fire, and its
    // body must reflect BOTH mutations (Name + Email fields AND the
    // page break with label "Step 2").
    await waitFor(() => expect(putBodies).toHaveLength(2));
    const second = JSON.parse(putBodies[1]);
    expect(second.fields.map((f: any) => f.type)).toEqual(["SHORT_TEXT", "EMAIL"]);
    expect(second.stepLabels).toEqual(["", "Step 2"]);
  });
});

describe("FormStep — Page break sub-flow", () => {
  it("Add Page break opens the editor + saves with a label", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      {
        method: "GET",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        body: {
          formData: {
            fields: [
              { id: "f-1", type: "SHORT_TEXT", label: "Name", required: true, step: 0 },
            ],
            stepLabels: [""],
          },
        },
      },
      {
        method: "PUT",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/,
        body: {},
      },
    ]);
    renderForm();
    await screen.findByText("Name");

    await user.click(screen.getByRole("button", { name: /\+ Page break/i }));
    expect(
      await screen.findByRole("heading", { name: /Add page break/i }),
    ).toBeInTheDocument();

    const labelInput = screen.getByPlaceholderText(/Tell us about your business/) as HTMLInputElement;
    await user.type(labelInput, "Step 2");
    // The visible CTA button has the same text as the heading; query by role
    // + name to disambiguate from the h5.
    await user.click(screen.getByRole("button", { name: /Add page break/i }));

    await waitFor(() => {
      const put = fetchFn.mock.calls.find(
        ([, init]: any) => (init?.method || "GET") === "PUT",
      );
      expect(put).toBeTruthy();
      const body = JSON.parse((put![1] as RequestInit).body as string);
      expect(body.stepLabels).toEqual(["", "Step 2"]);
    });
  });
});
