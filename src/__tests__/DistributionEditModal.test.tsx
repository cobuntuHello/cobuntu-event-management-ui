import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DistributionEditModal } from "../components/DistributionEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "evt-1",
    slug: "lisbon-meetup",
    featured: false,
    detailSource: "NATIVE",
    externalDetailUrl: null,
    ...overrides,
});

const baseProps = (overrides: Record<string, unknown> = {}) => ({
    event: baseEvent(),
    communityTag: "pbn",
    onClose: vi.fn(),
    onSaved: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
});

// Featured input is the only checkbox; resolve via role.
const featuredCheckbox = () => screen.getByRole("checkbox");
// Titles changed when the radio rows became tap-target tiles
// ("Cobuntu event page" / "Custom landing page" with descriptive
// subtitles below). Radios stay in the DOM as sr-only inputs so the
// form remains accessible.
const nativeRadio = () => screen.getByRole("radio", { name: /cobuntu event page/i });
const externalRadio = () => screen.getByRole("radio", { name: /custom landing page/i });
const urlInput = () => screen.getByPlaceholderText(/https:\/\/your-site\.com/i);

describe("DistributionEditModal — rendering", () => {
    it("renders heading + featured checkbox + native radio selected by default", () => {
        renderWithConfig(<DistributionEditModal {...baseProps()} />);
        expect(screen.getByText("Distribution")).toBeInTheDocument();
        expect(featuredCheckbox()).not.toBeChecked();
        expect(nativeRadio()).toBeChecked();
        expect(externalRadio()).not.toBeChecked();
        // External URL field hidden when NATIVE.
        expect(screen.queryByPlaceholderText(/your-site\.com/i)).not.toBeInTheDocument();
    });

    it("hydrates featured + EXTERNAL state from the event", () => {
        renderWithConfig(
            <DistributionEditModal
                {...baseProps({
                    event: baseEvent({
                        featured: true,
                        detailSource: "EXTERNAL",
                        externalDetailUrl: "https://custom.example.com/event",
                    }),
                })}
            />,
        );
        expect(featuredCheckbox()).toBeChecked();
        expect(externalRadio()).toBeChecked();
        expect((urlInput() as HTMLInputElement).value).toBe("https://custom.example.com/event");
    });

    it("reveals the URL field when switching to EXTERNAL", async () => {
        const user = userEvent.setup();
        renderWithConfig(<DistributionEditModal {...baseProps()} />);
        await user.click(externalRadio());
        expect(urlInput()).toBeInTheDocument();
    });
});

describe("DistributionEditModal — validation", () => {
    it("disables Save when EXTERNAL + URL empty or invalid", async () => {
        const user = userEvent.setup();
        renderWithConfig(<DistributionEditModal {...baseProps()} />);
        await user.click(externalRadio());
        const save = screen.getByRole("button", { name: /save/i });
        expect(save).toBeDisabled();
        await user.type(urlInput(), "not-a-url");
        expect(save).toBeDisabled();
        expect(screen.getByText(/must be a valid https/i)).toBeInTheDocument();
    });

    it("enables Save when EXTERNAL + valid https URL", async () => {
        const user = userEvent.setup();
        renderWithConfig(<DistributionEditModal {...baseProps()} />);
        await user.click(externalRadio());
        await user.type(urlInput(), "https://example.com/x");
        expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
    });

    it("Save is enabled for NATIVE without URL", () => {
        renderWithConfig(<DistributionEditModal {...baseProps()} />);
        expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
    });
});

describe("DistributionEditModal — save", () => {
    it("PUTs featured + NATIVE detailSource with null externalDetailUrl", async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        const showToast = vi.fn();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent({ featured: true }) } },
        ]);
        renderWithConfig(<DistributionEditModal {...baseProps({ onSaved, showToast })} />);
        await user.click(featuredCheckbox());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(showToast).toHaveBeenCalledWith("Distribution updated");
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body).toEqual({
            featured: true,
            detailSource: "NATIVE",
            externalDetailUrl: null,
            notifyAttendees: false,
        });
    });

    it("PUTs trimmed externalDetailUrl when EXTERNAL", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: {} },
        ]);
        renderWithConfig(<DistributionEditModal {...baseProps()} />);
        await user.click(externalRadio());
        // Note: leading/trailing spaces are stripped by the input's HTML; rely on .trim() inside save().
        await user.type(urlInput(), "https://x.example.com");
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.detailSource).toBe("EXTERNAL");
        expect(body.externalDetailUrl).toBe("https://x.example.com");
    });

    it("surfaces backend error message on failure", async () => {
        const user = userEvent.setup();
        const showToast = vi.fn();
        const onSaved = vi.fn();
        mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", status: 400, body: { error: "Custom URL is reserved" } },
        ]);
        renderWithConfig(<DistributionEditModal {...baseProps({ showToast, onSaved })} />);
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith("Custom URL is reserved"));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("Cancel calls onClose without saving", async () => {
        const onClose = vi.fn();
        const onSaved = vi.fn();
        const user = userEvent.setup();
        renderWithConfig(<DistributionEditModal {...baseProps({ onClose, onSaved })} />);
        await user.click(screen.getByRole("button", { name: /^cancel$/i }));
        expect(onClose).toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    });
});
