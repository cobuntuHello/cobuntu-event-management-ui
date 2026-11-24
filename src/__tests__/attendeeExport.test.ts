/**
 * The manage page's attendee export (T-397), from Anna's Food for Thought #1
 * file: accents broken, a garbled dash for every gifted place's price, no date
 * for them, and "Confirmed" on every row whatever its state.
 */
import { describe, expect, it } from "vitest";
import { toCsv } from "@cobuntu/management-ui-shared";
import { attendeeExportTable } from "../components/AttendeesAndInvitationsSection/attendeeExport";

const hosts = new Map([["host-1", "Anna Silva"]]);
const form = {
    fields: [
        { id: "f-name", type: "SHORT_TEXT", label: "Name" },
        { id: "f-cowork", type: "MULTIPLE_CHOICE", label: "Would you like to cowork?", options: [{ id: "o1", label: "Yes, in the morning" }, { id: "o2", label: "No, thank you" }] },
    ],
};

const base = { eventName: "Food for Thought #1", eventCurrency: "EUR", isPaid: true, hostNameById: hosts };

const bought = {
    id: "a1", name: "Gonçalo Ferreira", email: "g@x.pt", usertag: "gon", status: "APPROVED", tier: { name: "Standard" },
    registeredAt: "2026-11-17T10:00:00Z", paid: { amount: 3690, currency: "EUR", at: "2026-11-17T10:00:00Z", refunded: false },
    formAnswers: { ...form, answer: { "f-name": "Gonçalo", "f-cowork": ["o1"] } },
};
const gifted = { id: "a2", name: "André Barros", email: "a@x.pt", status: "APPROVED", tier: { name: "Standard" }, giftedBy: "host-1", registeredAt: "2026-11-18T09:00:00Z", paid: null };
const added = { id: "a3", name: "Rui Barros", email: "r@x.pt", status: "APPROVED", addedBy: "host-1", registeredAt: "2026-11-18T09:00:00Z", paid: null };

function table(attendees: any[], over: Record<string, unknown> = {}) {
    return attendeeExportTable({ ...base, attendees, ...over });
}
const col = (t: ReturnType<typeof table>, header: string) => t.columns.findIndex((c) => c.header === header);

describe("attendee export", () => {
    it("gives a gifted or added place a real price (0), how they got it, and the date", () => {
        const t = table([bought, gifted, added]);
        const price = col(t, "Ticket price");
        expect(t.rows.map((r) => r[price])).toEqual([36.9, 0, 0]);
        expect(t.rows.map((r) => r[col(t, "How")])).toEqual(["Bought", "Gift from Anna Silva", "Added by Anna Silva"]);
        expect(t.rows[1][col(t, "Got their place")]).toEqual(new Date("2026-11-18T09:00:00Z"));
        expect(t.rows[1][col(t, "Paid on")]).toBeNull();
        expect(t.rows[0][col(t, "Paid on")]).toEqual(new Date("2026-11-17T10:00:00Z"));
    });

    it("says each place's real status, refunded included", () => {
        const t = table([
            bought,
            { ...bought, id: "p", status: "PENDING", paid: null },
            { ...bought, id: "c", status: "CANCELLED", paid: { ...bought.paid, refunded: true } },
            { ...bought, id: "r", status: "REJECTED" },
        ]);
        expect(t.rows.map((r) => r[col(t, "Status")])).toEqual(["Confirmed", "Waiting for approval", "Refunded", "Not accepted"]);
    });

    it("puts every form question in its own column, with what was picked, not option ids", () => {
        const t = table([bought, gifted]);
        expect(t.columns.slice(-2).map((c) => c.header)).toEqual(["Form: Name", "Form: Would you like to cowork?"]);
        expect(t.rows[0].slice(-2)).toEqual(["Gonçalo", "Yes, in the morning"]);
        expect(t.rows[1].slice(-2)).toEqual(["", ""]);
    });

    it("falls back to the sales-feed match when a place has no sale of its own, and leaves an unknown price empty", () => {
        const legacy = { ...bought, id: "old", paid: undefined };
        const unknown = { ...bought, id: "unk", paid: undefined };
        const t = table([legacy, unknown], {
            saleFor: (a: any) => (a.id === "old" ? { grossAmount: 2952, currency: "EUR", createdAt: "2026-11-16T10:00:00Z" } : undefined),
        });
        expect(t.rows.map((r) => r[col(t, "Ticket price")])).toEqual([29.52, null]);
    });

    it("prices a free event's places at 0 and calls them registered", () => {
        const t = table([{ ...bought, paid: null }], { isPaid: false });
        expect(t.rows[0][col(t, "Ticket price")]).toBe(0);
        expect(t.rows[0][col(t, "How")]).toBe("Registered");
    });

    it("names who bought a companion's seat, and adds a Phone column only when someone has one", () => {
        const companion = { id: "c1", name: "Guest 1", status: "APPROVED", companion: true, purchaserEmail: "buyer@x.pt", phone: "+351 900", paid: { amount: 3690, currency: "EUR", at: "2026-11-17T10:00:00Z" } };
        const t = table([companion]);
        expect(t.rows[0][col(t, "How")]).toBe("Ticket bought by buyer@x.pt");
        expect(t.rows[0][col(t, "Phone")]).toBe("+351 900");
        expect(col(table([bought]), "Phone")).toBe(-1);
    });

    it("writes accents that survive Excel and no dash anywhere", () => {
        const csv = toCsv(table([bought, gifted]));
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain("Gonçalo Ferreira");
        expect(csv).toContain("André Barros");
        expect(csv).not.toMatch(/[—–]/);
    });
});
