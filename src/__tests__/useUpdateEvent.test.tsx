import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { EventManagementConfigProvider, useUpdateEvent } from "../config";
import { mockFetch } from "./test-utils";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EventManagementConfigProvider
    value={{
      apiBaseUrl: "http://api.test",
      authHeaders: () => ({ Authorization: "Bearer t" }),
      stripeConnectUrl: () => "",
      navigate: () => {},
    }}
  >
    {children}
  </EventManagementConfigProvider>
);

describe("useUpdateEvent", () => {
  it("PUTs to /api/communities/:tag/events/:id with auth + JSON headers", async () => {
    const fetchMock = mockFetch([
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const { result } = renderHook(() => useUpdateEvent(), { wrapper });

    await result.current("c-1", "evt-1", { name: "X" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/communities/c-1/events/evt-1");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer t",
    });
    expect(JSON.parse(init?.body as string)).toEqual({ name: "X" });
  });

  it("throws with backend error message on non-2xx", async () => {
    mockFetch([
      { method: "PUT", url: "/events/evt-1", status: 400, body: { error: "Bad input" } },
    ]);
    const { result } = renderHook(() => useUpdateEvent(), { wrapper });

    await expect(result.current("c-1", "evt-1", {})).rejects.toThrow("Bad input");
  });

  it("falls back to a generic message when the response has no error field", async () => {
    mockFetch([
      { method: "PUT", url: "/events/evt-1", status: 500, body: {} },
    ]);
    const { result } = renderHook(() => useUpdateEvent(), { wrapper });

    await expect(result.current("c-1", "evt-1", {})).rejects.toThrow("Failed to update");
  });
});
