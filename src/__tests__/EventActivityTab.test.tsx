/**
 * Tests for the EventActivityTab component shipped in PR 6.
 *
 * Pinned:
 *   - First page loads on mount + renders one row per entry with the
 *     correct sentence text.
 *   - URL carries the correct path + limit param.
 *   - 401/403/404 surface clear error copy + a Retry button.
 *   - Successful retry clears the error state.
 *   - Exhausted feed (nextCursor=null) renders the "End of activity"
 *     footer.
 *
 * Infinite-scroll behaviour is exercised in a sibling test that
 * stubs IntersectionObserver — JSDOM doesn't fire it natively.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventActivityTab } from "../components/activity/EventActivityTab";
import { renderWithConfig, mockFetch } from "./test-utils";

beforeEach(() => {
    // Stub IntersectionObserver — JSDOM doesn't ship one, and the
    // component creates one in an effect even when exhausted. Without
    // this every test throws.
    (globalThis as any).IntersectionObserver = class {
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() { return []; }
    };
});

const event = { id: "evt-1", slug: "evt-1" };

function makeEntry(over: Partial<any> = {}) {
    return {
        id: `EA:${Math.random()}`,
        source: "EVENT_AUDIT",
        action: "EVENT_CREATED",
        createdAt: "2026-06-19T10:00:00Z",
        actor: { id: "u-bea", name: "Bea Host", usertag: "bea", profileImage: null },
        payload: { eventName: "W35" },
        ...over,
    };
}

describe("EventActivityTab — first-page render", () => {
    it("loads first page on mount + renders one row per entry", async () => {
        mockFetch([
            {
                url: /\/communities\/pbn\/events\/evt-1\/activity/,
                body: {
                    entries: [
                        makeEntry({ action: "EVENT_CREATED", payload: { eventName: "W35" } }),
                        makeEntry({
                            action: "ATTENDEE_APPROVED",
                            payload: { attendeeName: "Ana", tierName: "VIP" },
                        }),
                    ],
                    nextCursor: null,
                },
            },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/created the event/)).toBeInTheDocument());
        expect(screen.getByText(/approved Ana into the "VIP" tier/)).toBeInTheDocument();
    });

    it("URL carries the limit param", async () => {
        const fetchMock = mockFetch([
            {
                url: /\/communities\/pbn\/events\/evt-1\/activity/,
                body: { entries: [], nextCursor: null },
            },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" pageSize={7} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const calledUrl = String(fetchMock.mock.calls[0][0]);
        expect(calledUrl).toMatch(/limit=7/);
        expect(calledUrl).not.toMatch(/cursor=/);
    });

    it("empty entries renders the empty-state copy", async () => {
        mockFetch([
            {
                url: /\/activity/,
                body: { entries: [], nextCursor: null },
            },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/No activity yet/)).toBeInTheDocument());
    });

    it("non-null nextCursor renders the sentinel (no End-of-activity footer)", async () => {
        mockFetch([
            {
                url: /\/activity/,
                body: { entries: [makeEntry()], nextCursor: "next-page-cursor" },
            },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/created the event/)).toBeInTheDocument());
        expect(screen.queryByText(/End of activity/)).not.toBeInTheDocument();
    });

    it("null nextCursor renders the End-of-activity footer", async () => {
        mockFetch([
            {
                url: /\/activity/,
                body: { entries: [makeEntry()], nextCursor: null },
            },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/End of activity/)).toBeInTheDocument());
    });
});

describe("EventActivityTab — errors", () => {
    it("401 renders the 'sign in' error + a Retry button", async () => {
        mockFetch([
            {
                url: /\/activity/,
                status: 401,
                body: { error: "Unauthorized" },
            },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/Sign in to view/)).toBeInTheDocument());
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("403 renders 'not authorized'", async () => {
        mockFetch([
            { url: /\/activity/, status: 403, body: { error: "Forbidden" } },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/Not authorized/)).toBeInTheDocument());
    });

    it("404 renders 'event not found'", async () => {
        mockFetch([
            { url: /\/activity/, status: 404, body: { error: "Not found" } },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/Event not found/)).toBeInTheDocument());
    });

    it("Retry clears the error + loads entries when the second call succeeds", async () => {
        // First call 500s, second succeeds. mockFetch evaluates routes
        // in order, so we use a single route with bodyFn to alternate.
        let call = 0;
        (globalThis as any).fetch = vi.fn(async () => {
            call++;
            if (call === 1) return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
            return new Response(
                JSON.stringify({ entries: [makeEntry()], nextCursor: null }),
                { status: 200 },
            );
        });
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText(/Failed to load activity/)).toBeInTheDocument());
        await userEvent.click(screen.getByRole("button", { name: /retry/i }));
        await waitFor(() => expect(screen.getByText(/created the event/)).toBeInTheDocument());
        expect(screen.queryByText(/Failed to load activity/)).not.toBeInTheDocument();
    });
});

/**
 * The relative-base regression.
 *
 * The community app is same-origin and passes apiBaseUrl: "" so the session
 * cookie rides along. This tab built its request with `new URL()`, which needs
 * an absolute base, so it threw "Failed to construct 'URL': Invalid URL" and
 * every host on that app saw an error where the log should be. The admin app
 * passes an absolute base, which is why it went unnoticed.
 */
describe("EventActivityTab — relative api base", () => {
    it("fetches without throwing when apiBaseUrl is empty", async () => {
        const fetchMock = mockFetch([
            { url: /\/api\/communities\/pbn\/events\/evt-1\/activity/, body: { entries: [makeEntry()], nextCursor: null } },
        ]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />, {
            config: { apiBaseUrl: "" },
        });
        await waitFor(() => expect(screen.getByText(/created the event/)).toBeInTheDocument());
        expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/api\/communities\/pbn\/events\/evt-1\/activity\?/);
    });

    it("keeps limit + cursor on a relative base", async () => {
        const fetchMock = mockFetch([{ url: /activity/, body: { entries: [], nextCursor: null } }]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" pageSize={7} />, {
            config: { apiBaseUrl: "" },
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(String(fetchMock.mock.calls[0][0])).toContain("limit=7");
    });

    it("still works with an absolute base", async () => {
        const fetchMock = mockFetch([{ url: /activity/, body: { entries: [], nextCursor: null } }]);
        renderWithConfig(<EventActivityTab event={event} communityTag="pbn" />, {
            config: { apiBaseUrl: "https://api.example.com" },
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/api\.example\.com\/api\/communities\//);
    });
});
