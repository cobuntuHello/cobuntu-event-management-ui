/**
 * The event description quick-edit (/manage General tab) runs on the shared
 * DescriptionDialog: the editor fills the dialog, Save sits in the same row as
 * Add image and the counter, and there is no top close X. Save still PUTs the
 * event.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventManagementConfigProvider } from "../config";
import { DescriptionEditModal } from "../components/DescriptionEditModal";
import { mockFetch } from "./test-utils";

function renderModal() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const showToast = vi.fn();
  render(
    <EventManagementConfigProvider
      value={{
        apiBaseUrl: "http://api.test",
        authHeaders: () => ({ Authorization: "Bearer t" }),
        stripeConnectUrl: () => "",
        navigate: () => {},
      }}
    >
      <DescriptionEditModal
        event={{ id: "evt-1", description: "Old text" }}
        communityTag="c-1"
        onClose={onClose}
        onSaved={onSaved}
        showToast={showToast}
      />
    </EventManagementConfigProvider>,
  );
  return { onClose, onSaved, showToast };
}

const textarea = () => screen.getByRole("dialog").querySelector("textarea") as HTMLTextAreaElement;

describe("DescriptionEditModal", () => {
  it("opens the shared dialog with the saved text and no top close X", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Edit description" })).toBeTruthy();
    expect(textarea().value).toBe("Old text");
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });

  it("Save PUTs the trimmed description, then reports it saved", async () => {
    const fetchMock = mockFetch([{ method: "PUT", url: "/events/evt-1", body: { ok: true } }]);
    const { onSaved, showToast } = renderModal();
    fireEvent.change(textarea(), { target: { value: "  New text  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/communities/c-1/events/evt-1");
    expect(JSON.parse(String(init.body))).toEqual({ description: "New text" });
    expect(showToast).toHaveBeenCalledWith("Description updated");
  });

  it("Cancel closes without saving", () => {
    const fetchMock = mockFetch([]);
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
