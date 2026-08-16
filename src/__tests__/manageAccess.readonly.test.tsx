/**
 * Read-only manage: the editing surfaces stop opening.
 *
 * ── What this pins ──────────────────────────────────────────────────────────
 *
 * Opening the manage page and editing what is on it are different permissions.
 * The backend has always treated them that way — a leader of a community that
 * CARRIES someone's event may look at it, while editing follows ownership — but
 * the page only ever asked the first question, so a carrying leader got the
 * full edit interface and every save came back 403.
 *
 * The guard is at the OPENER rather than at each button, because a modal that
 * cannot be opened cannot save. That makes the property testable in one place
 * instead of across forty-odd controls, and it means a button that slips
 * through leads nowhere rather than leading to a 403.
 *
 * The closing direction stays open on purpose: read-only is about writing, and
 * trapping someone in a dialog they cannot dismiss is a worse bug than the one
 * being fixed.
 */

import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useState } from "react";
import { ManageAccessProvider, useCanEdit, useEditAction } from "../lib/manageAccess";

/** A stand-in for the openers the real views hold. */
function Editable() {
  const [open, setOpenState] = useState(false);
  const canEdit = useCanEdit();
  const setOpen = (v: boolean) => {
    if (!canEdit && v !== false) return;
    setOpenState(v);
  };
  return (
    <div>
      <button onClick={() => setOpen(true)}>Edit price</button>
      <button onClick={() => setOpen(false)}>Close</button>
      {open && <div data-testid="modal">price editor</div>}
      <span data-testid="can-edit">{String(canEdit)}</span>
    </div>
  );
}

describe("read-only manage access", () => {
  it("opens the editor normally when the viewer may edit", () => {
    render(
      <ManageAccessProvider canEdit>
        <Editable />
      </ManageAccessProvider>,
    );
    act(() => { screen.getByText("Edit price").click(); });
    expect(screen.getByTestId("modal")).toBeInTheDocument();
  });

  it("refuses to open it when the viewer may not", () => {
    render(
      <ManageAccessProvider canEdit={false}>
        <Editable />
      </ManageAccessProvider>,
    );
    act(() => { screen.getByText("Edit price").click(); });
    expect(screen.queryByTestId("modal")).toBeNull();
  });

  it("still lets a read-only viewer CLOSE something that is open", () => {
    // Read-only is about writing. A dialog nobody can dismiss is worse than
    // the bug this fixes.
    function AlreadyOpen() {
      const [open, setOpenState] = useState(true);
      const canEdit = useCanEdit();
      const setOpen = (v: boolean) => {
        if (!canEdit && v !== false) return;
        setOpenState(v);
      };
      return (
        <div>
          <button onClick={() => setOpen(false)}>Close</button>
          {open && <div data-testid="modal">open</div>}
        </div>
      );
    }
    render(
      <ManageAccessProvider canEdit={false}>
        <AlreadyOpen />
      </ManageAccessProvider>,
    );
    expect(screen.getByTestId("modal")).toBeInTheDocument();
    act(() => { screen.getByText("Close").click(); });
    expect(screen.queryByTestId("modal")).toBeNull();
  });

  it("defaults to editable with no provider, so existing consumers are unchanged", () => {
    // The default is the whole reason this could ship without touching every
    // surface at once. A restrictive default would silently freeze every page
    // that has not been updated yet.
    render(<Editable />);
    expect(screen.getByTestId("can-edit").textContent).toBe("true");
    act(() => { screen.getByText("Edit price").click(); });
    expect(screen.getByTestId("modal")).toBeInTheDocument();
  });
});

describe("useEditAction", () => {
  it("hands back undefined when read-only, so a control can omit itself", () => {
    function Probe() {
      const onEdit = useEditAction(() => {});
      return <span data-testid="handler">{onEdit ? "present" : "absent"}</span>;
    }
    render(
      <ManageAccessProvider canEdit={false}>
        <Probe />
      </ManageAccessProvider>,
    );
    expect(screen.getByTestId("handler").textContent).toBe("absent");
  });

  it("passes the handler straight through when editable", () => {
    let ran = false;
    function Probe() {
      const onEdit = useEditAction(() => { ran = true; });
      return <button onClick={onEdit}>go</button>;
    }
    render(
      <ManageAccessProvider canEdit>
        <Probe />
      </ManageAccessProvider>,
    );
    act(() => { screen.getByText("go").click(); });
    expect(ran).toBe(true);
  });
});
