import { describe, it, expect } from "vitest";
import { useCallback, useRef, useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormStep } from "../components/PriceEditModal/steps/FormStep";
import {
  FooterSlotContext,
  PendingCommitContext,
  type PendingCommit,
} from "../components/PriceEditModal/footer-slot";
import { blankTier } from "../components/PriceEditModal/helpers";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The modal's Save commits a question that is still open in the editor.
 *
 * Impact Hub Porto, 2026-11-06: the host wrote a question and pressed the
 * modal's big Save instead of the editor's small "Add question". The tier
 * saved, the modal closed, and the question was never sent. The harness
 * stands in for PriceEditModal: it provides the same two contexts, and its
 * "Save" button runs every registered pending commit, as onSaveClicked does.
 */
function Harness() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const commits = useRef(new Set<PendingCommit>());
  const register = useCallback((fn: PendingCommit) => {
    commits.current.add(fn);
    return () => { commits.current.delete(fn); };
  }, []);
  const tier = { ...blankTier("EUR", 1), id: "tier-1", name: "Standard", price: "30", currency: "EUR" };
  return (
    <FooterSlotContext.Provider value={slot}>
      <PendingCommitContext.Provider value={register}>
        <FormStep t={tier} communityTag="c-1" showToast={() => {}} />
        <div ref={setSlot} />
        <button
          type="button"
          onClick={async () => { for (const c of Array.from(commits.current)) await c(); }}
        >
          Modal Save
        </button>
      </PendingCommitContext.Provider>
    </FooterSlotContext.Provider>
  );
}

const putBodies = (fetchFn: any) =>
  fetchFn.mock.calls
    .filter(([, init]: any) => (init?.method || "GET") === "PUT")
    .map(([, init]: any) => JSON.parse(init.body as string));

describe("FormStep — the modal's Save commits an open question", () => {
  it("a question still open in the editor is PUT when the modal's Save is pressed", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      { method: "GET", url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/, status: 404, body: {} },
      { method: "PUT", url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/, body: {} },
    ]);
    renderWithConfig(<Harness />);

    await user.click(await screen.findByRole("button", { name: /Add question/i }));
    await user.click(screen.getByRole("button", { name: /Short Text/i }));
    const label = (await screen.findByLabelText("Question")) as HTMLInputElement;
    await user.clear(label);
    await user.type(label, "Queres usar o Coworking?");

    // NOT the editor's "Add question": the host's actual click.
    await user.click(screen.getByRole("button", { name: "Modal Save" }));

    const bodies = putBodies(fetchFn);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].fields).toHaveLength(1);
    expect(bodies[0].fields[0]).toMatchObject({ type: "SHORT_TEXT", label: "Queres usar o Coworking?" });
  });

  it("nothing is committed once the question was confirmed (no duplicate PUT)", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      { method: "GET", url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/, status: 404, body: {} },
      { method: "PUT", url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/, body: {} },
    ]);
    renderWithConfig(<Harness />);

    await user.click(await screen.findByRole("button", { name: /Add question/i }));
    await user.click(screen.getByRole("button", { name: /Short Text/i }));
    const label = (await screen.findByLabelText("Question")) as HTMLInputElement;
    await user.clear(label);
    await user.type(label, "Dieta");
    await user.click(screen.getByRole("button", { name: /Add question/i }));
    await screen.findByText("Dieta");

    await user.click(screen.getByRole("button", { name: "Modal Save" }));

    expect(putBodies(fetchFn)).toHaveLength(1);
  });
});
