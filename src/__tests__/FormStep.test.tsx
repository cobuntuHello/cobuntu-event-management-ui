import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormStep } from "../components/PriceEditModal/steps/FormStep";
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

function renderForm(props: Partial<React.ComponentProps<typeof FormStep>> = {}) {
  return renderWithConfig(
    <FormStep
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
      await screen.findByRole("button", { name: /Add first question/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Use default/i }),
    ).toBeInTheDocument();
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
      name: /Add first question/i,
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
      name: /Add first question/i,
    });
    await user.click(addFirst);
    expect(
      await screen.findByRole("heading", { name: /Add a question/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("Back to form fields"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Add first question/i }),
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
