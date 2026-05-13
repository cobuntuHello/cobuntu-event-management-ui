import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SlugEditModal } from "../components/SlugEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = { id: "evt-1", slug: "old-slug" };
const baseProps = (overrides: any = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("SlugEditModal", () => {
  it("PATCHes /slug + calls onSlugChanged with the backend-returned slug", async () => {
    const user = userEvent.setup();
    const onSlugChanged = vi.fn();
    const fetchMock = mockFetch([
      { method: "PATCH", url: "/events/evt-1/slug", body: { slug: "new-slug" } },
    ]);
    renderWithConfig(<SlugEditModal {...baseProps({ onSlugChanged })} />);

    const input = screen.getByDisplayValue("old-slug");
    await user.clear(input);
    await user.type(input, "new-slug");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onSlugChanged).toHaveBeenCalledWith("new-slug"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ slug: "new-slug" });
  });

  it("normalizes input to URL-safe slug as you type", async () => {
    const user = userEvent.setup();
    renderWithConfig(<SlugEditModal {...baseProps()} />);

    const input = screen.getByDisplayValue("old-slug") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "My Event! 2026");

    // Uppercase + spaces + ! all get normalized to lowercase letters / hyphens
    expect(input.value).toBe("my-event--2026");
  });

  it("does NOT call onSlugChanged on backend error", async () => {
    const user = userEvent.setup();
    const onSlugChanged = vi.fn();
    mockFetch([
      { method: "PATCH", url: "/events/evt-1/slug", status: 409, body: { error: "Slug in use" } },
    ]);
    const props = baseProps({ onSlugChanged });
    renderWithConfig(<SlugEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Slug in use"));
    expect(onSlugChanged).not.toHaveBeenCalled();
  });
});
