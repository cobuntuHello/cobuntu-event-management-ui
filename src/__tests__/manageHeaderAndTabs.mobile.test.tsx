/**
 * The manage page on a phone: one row of chrome, and a tab strip that says
 * when it has more.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 *
 * Two things, both of them desktop layout shown to a phone.
 *
 * Back and Preview took a row of their own under the title. A phone shows
 * roughly seven rows above the fold, and one of them was two buttons, one of
 * which duplicated the breadcrumb sitting directly above it.
 *
 * The tab strip overflowed into a horizontal scrollbar. A scrollbar is a
 * pointer widget: on a touch screen it is either invisible or a grey sliver,
 * so a host on Overview had no way to know Attendees and Activity were off to
 * the right. The strip looked like the whole strip.
 *
 * ── What is pinned here ─────────────────────────────────────────────────────
 *
 * The fades are asserted through SCROLL STATE rather than by looking for a
 * class, because "there is a gradient element in the DOM" was already true of
 * a version that painted both fades permanently. What makes them an indicator
 * is that they answer a question about scrollLeft, so that is what is tested.
 *
 * jsdom has no layout: scrollWidth and clientWidth are both 0 unless told
 * otherwise, which is also the honest representation of a strip that fits.
 * Each test that wants an overflowing strip says so explicitly.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { EventManageHeader } from "../page/EventManageHeader";
import { SectionsNav } from "../page/sections/SectionsNav";

const CRUMBS = [{ label: "Events", onClick: () => {} }, { label: "Founders' Night" }];

function renderHeader(over: Partial<Parameters<typeof EventManageHeader>[0]> = {}) {
    const onPreview = vi.fn();
    const onBack = vi.fn();
    const utils = render(
        <EventManageHeader
            breadcrumbs={CRUMBS}
            title="Founders' Night"
            subtitle="Published · 7 attendees"
            onBack={onBack}
            backLabel="Events"
            onPreview={onPreview}
            previewLabel="Preview"
            {...over}
        />,
    );
    return { ...utils, onPreview, onBack };
}

/** The desktop Back/Preview pair, found by the container that holds them. */
function actionsRow(container: HTMLElement) {
    return container.querySelector<HTMLElement>("div.items-center.gap-2.md\\:shrink-0");
}

/*
 * Two buttons answer to "Preview": the icon a phone sees and the labelled one
 * md+ sees. Both are always in the DOM -- which is the point, the breakpoint
 * chooses -- so the tests have to say which they mean.
 */
function mobilePreview(container: HTMLElement) {
    return container.querySelector<HTMLElement>("button.md\\:hidden[aria-label='Preview']");
}

describe("EventManageHeader on a phone", () => {
    it("hides the Back/Preview row and puts Preview on the breadcrumb row", () => {
        const { container, onPreview } = renderHeader();

        // The pair is still rendered -- it is what md+ shows -- but it is
        // display:none below md rather than stacked under the title.
        expect(actionsRow(container)!.className).toContain("hidden md:flex");

        // And the phone gets one icon, labelled for anyone not looking at it.
        const preview = mobilePreview(container)!;
        expect(preview).toBeTruthy();
        fireEvent.click(preview);
        expect(onPreview).toHaveBeenCalledTimes(1);
    });

    it("gives that icon a 44px target, since it carries no label to widen it", () => {
        const { container } = renderHeader();
        const preview = mobilePreview(container)!;
        expect(preview.className).toMatch(/\bh-11\b/);
        expect(preview.className).toMatch(/\bw-11\b/);
    });

    it("drops Back on a phone, because the first crumb already is Back", () => {
        renderHeader();
        // Two controls read "Events": the crumb, and the hidden desktop button.
        // The crumb is the one a phone can reach.
        const crumb = screen.getAllByRole("button", { name: "Events" })[0];
        expect(crumb.className).not.toContain("hidden");
    });

    it("keeps the pair visible when there is no breadcrumb row to move it to", () => {
        // A caller passing no breadcrumbs has no row above the title, so
        // hiding the actions below md would leave Preview unreachable.
        const { container } = renderHeader({ breadcrumbs: [] });
        expect(actionsRow(container)!.className).not.toContain("hidden");
        expect(mobilePreview(container)).toBeNull();
        expect(screen.getAllByRole("button", { name: "Preview" })).toHaveLength(1);
    });
});

/** The scrolling element inside SectionsNav, and the two fades beside it. */
function strip(container: HTMLElement) {
    const scroller = container.querySelector<HTMLElement>(".overflow-x-auto")!;
    const fades = Array.from(container.querySelectorAll<HTMLElement>("span[aria-hidden].pointer-events-none"));
    return { scroller, left: fades[0], right: fades[1] };
}

/** Teach jsdom that the strip is wider than the window showing it. */
function makeOverflowing(scroller: HTMLElement, { width = 320, content = 900, at = 0 } = {}) {
    Object.defineProperty(scroller, "clientWidth", { value: width, configurable: true });
    Object.defineProperty(scroller, "scrollWidth", { value: content, configurable: true });
    scroller.scrollLeft = at;
}

describe("SectionsNav tab strip", () => {
    it("hides the scrollbar rather than showing a pointer widget to a thumb", () => {
        const { container } = render(<SectionsNav communityTag="pbn" activeView="overview" onViewChange={() => {}} />);
        const { scroller } = strip(container);
        expect(scroller.className).toContain("[scrollbar-width:none]");
        expect(scroller.className).toContain("[&::-webkit-scrollbar]:hidden");
    });

    it("shows no fade when every tab fits", () => {
        const { container } = render(<SectionsNav communityTag="pbn" activeView="overview" onViewChange={() => {}} />);
        const { left, right } = strip(container);
        expect(left.className).toContain("opacity-0");
        expect(right.className).toContain("opacity-0");
    });

    it("fades the end that has more behind it, and only that end", () => {
        const { container } = render(<SectionsNav communityTag="pbn" activeView="overview" onViewChange={() => {}} />);
        const { scroller } = strip(container);

        // At the left edge: more to the right, nothing to the left.
        makeOverflowing(scroller, { at: 0 });
        act(() => { fireEvent.scroll(scroller); });
        expect(strip(container).left.className).toContain("opacity-0");
        expect(strip(container).right.className).toContain("opacity-100");

        // Mid-strip: both.
        makeOverflowing(scroller, { at: 300 });
        act(() => { fireEvent.scroll(scroller); });
        expect(strip(container).left.className).toContain("opacity-100");
        expect(strip(container).right.className).toContain("opacity-100");

        // Scrolled to the end: nothing more to the right.
        makeOverflowing(scroller, { at: 900 - 320 });
        act(() => { fireEvent.scroll(scroller); });
        expect(strip(container).left.className).toContain("opacity-100");
        expect(strip(container).right.className).toContain("opacity-0");
    });

    it("does not strand the right fade on a fractional scroll position", () => {
        // scrollLeft is fractional under browser zoom, so an exact
        // `scrollLeft < max` comparison leaves the fade on forever at the end
        // of the strip. This is that quarter-pixel.
        const { container } = render(<SectionsNav communityTag="pbn" activeView="overview" onViewChange={() => {}} />);
        const { scroller } = strip(container);
        makeOverflowing(scroller, { at: 900 - 320 - 0.25 });
        act(() => { fireEvent.scroll(scroller); });
        expect(strip(container).right.className).toContain("opacity-0");
    });

    it("scrolls the active tab into view, so a deep link is not a broken nav", () => {
        // Landing on Activity from a saved URL showed the first few tabs and
        // no underline anywhere.
        const { container } = render(<SectionsNav communityTag="pbn" activeView="overview" onViewChange={() => {}} />);
        const { scroller } = strip(container);
        makeOverflowing(scroller, { at: 0 });

        const activity = screen.getByRole("button", { name: "Activity" });
        Object.defineProperty(activity, "offsetLeft", { value: 600, configurable: true });
        Object.defineProperty(activity, "offsetWidth", { value: 80, configurable: true });

        // Re-render with Activity active; the layout effect should catch up.
        act(() => {
            render(<SectionsNav communityTag="pbn" activeView="activity" onViewChange={() => {}} />, { container });
        });
        expect(scroller.scrollLeft).toBeGreaterThan(0);
    });
});
