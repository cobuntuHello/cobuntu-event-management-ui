/**
 * The attendee list as a table, for the manage page's Export (T-397).
 *
 * Anna exported Food for Thought #1 and got, in Excel:
 *   - "GonÃ§alo" for "Gonçalo" (the CSV had no byte-order mark; the shared
 *     writer adds it, and the Excel option needs none),
 *   - a garbled dash as the price of every gifted place, and no date for them,
 *   - "Confirmed" on every row, whatever the place's real state.
 *
 * Every place is one row: who, which tier, its real status, HOW they got it
 * (bought, a host's gift, added by a host, bought for them by someone else),
 * what it cost (0 for a gift or an add), when they got it, when it was paid,
 * then, for a viewer the event's Ledger would show the sale to, where the
 * money went (community, Cobuntu, Stripe, seller, VAT, seller net), then one
 * column per question of the tier's form.
 *
 * Price and payment date come from the place's own sale (`paid`, from the
 * manage payload since T-397). `saleFor` is the older match by buyer or email
 * against the community sales feed, kept for places the backend could not tie
 * to a sale.
 */
import type { ExportCell, ExportColumn, ExportTable } from "@cobuntu/management-ui-shared";
import { answerText, type AnswerField } from "./answerText";

/** Where one seat's money went, in cents (backend shared/sales/saleSplit.ts). */
export interface SeatSplit {
    donation: number; shipping: number; vat: number;
    community: number; communityName: string | null;
    cobuntu: number; stripe: number; seller: number; sellerExVat: number;
}
/**
 * `split` is present only for a viewer the event's Ledger shows the sale to;
 * null on a fully refunded seat or another community's sale.
 */
export interface SeatPaid { amount: number; currency: string; at: string; refunded?: boolean; split?: SeatSplit | null }
export interface MatchedSale { grossAmount: number; currency: string; createdAt: string }

export interface AttendeeExportInput {
    /** The event's attendee rows, as the manage payload carries them. */
    attendees: any[];
    eventName: string;
    eventCurrency: string;
    /** The event has a price: a place with no sale is then unknown, not free. */
    isPaid: boolean;
    /** Host user id to name, for "Gift from" / "Added by". */
    hostNameById: Map<string, string>;
    /** The older sales-feed match, used only when a place has no `paid`. */
    saleFor?: (attendee: any) => MatchedSale | undefined;
    /** Translated words for the How column; English when omitted. */
    words?: Partial<AttendeeExportWords>;
}

export interface AttendeeExportWords {
    bought: string;
    registered: string;
    giftFrom: (name: string) => string;
    addedBy: (name: string) => string;
    boughtBy: (who: string) => string;
    aHost: string;
    someoneElse: string;
}

const ENGLISH: AttendeeExportWords = {
    bought: "Bought",
    registered: "Registered",
    giftFrom: (name) => `Gift from ${name}`,
    addedBy: (name) => `Added by ${name}`,
    boughtBy: (who) => `Ticket bought by ${who}`,
    aHost: "a host",
    someoneElse: "another attendee",
};

const STATUS: Record<string, string> = {
    APPROVED: "Confirmed",
    PENDING: "Waiting for approval",
    PENDING_PAYMENT: "Waiting for payment",
    REJECTED: "Not accepted",
    CANCELLED: "Cancelled",
};

function statusOf(a: any): string {
    if (a.paid?.refunded) return "Refunded";
    if (!a.status) return STATUS.APPROVED;
    return STATUS[a.status] ?? String(a.status);
}

function dateOf(iso: unknown): Date | null {
    if (!iso) return null;
    const d = new Date(String(iso));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function attendeeExportTable(input: AttendeeExportInput): ExportTable {
    const w: AttendeeExportWords = { ...ENGLISH, ...input.words };
    const hostName = (id: string) => input.hostNameById.get(id) || w.aHost;

    // One column per question, in the order the forms ask them, across every tier.
    const fieldOrder: string[] = [];
    const fieldDefs = new Map<string, AnswerField & { label?: string }>();
    for (const a of input.attendees) {
        const fields = a.formAnswers?.fields;
        if (!Array.isArray(fields)) continue;
        for (const f of fields) {
            if (!f?.id || fieldDefs.has(f.id)) continue;
            fieldDefs.set(f.id, f);
            fieldOrder.push(f.id);
        }
    }
    const hasPhone = input.attendees.some((a) => a.phone);
    // The split columns (T-397), only when the backend sent a split, i.e. the
    // viewer may see this event's Ledger. Each row adds up to what was paid:
    // ticket + donation = community + Cobuntu + Stripe + seller.
    const hasSplit = input.attendees.some((a) => a.paid && "split" in a.paid);
    const hasDonation = input.attendees.some((a) => (a.paid?.split?.donation ?? 0) > 0);

    const columns: ExportColumn[] = [
        { header: "Name" },
        { header: "Email" },
        ...(hasPhone ? [{ header: "Phone" } as ExportColumn] : []),
        { header: "Usertag" },
        { header: "Tier" },
        { header: "Status" },
        { header: "How" },
        { header: "Ticket price", kind: "money" },
        { header: "Currency" },
        { header: "Got their place", kind: "date" },
        { header: "Paid on", kind: "date" },
        ...(hasSplit ? [
            ...(hasDonation ? [{ header: "Donation", kind: "money" } as ExportColumn] : []),
            { header: "Community" },
            { header: "Community gets", kind: "money" },
            { header: "Cobuntu gets", kind: "money" },
            { header: "Stripe gets", kind: "money" },
            { header: "Seller gets", kind: "money" },
            { header: "VAT", kind: "money" },
            { header: "Seller net (excl. VAT)", kind: "money" },
        ] as ExportColumn[] : []),
        // "Form:" keeps a question called "Name" or "Email" apart from the columns above.
        ...fieldOrder.map((id) => ({ header: `Form: ${fieldDefs.get(id)?.label || id}` })),
    ];

    const rows: ExportCell[][] = input.attendees.map((a) => {
        const paid: SeatPaid | null | undefined = a.paid;
        const matched = paid ? undefined : input.saleFor?.(a);
        const gift = !!a.giftedBy;
        const added = !!a.addedBy;
        const companion = !!a.companion;

        let how: string;
        if (gift) how = w.giftFrom(hostName(a.giftedBy));
        else if (added) how = w.addedBy(hostName(a.addedBy));
        else if (companion) how = w.boughtBy(a.purchaserEmail || w.someoneElse);
        else if (paid || matched) how = w.bought;
        else how = input.isPaid ? w.bought : w.registered;

        // A gift or an add cost the person nothing; a free event costs nothing;
        // a paid place shows what was paid; a paid event's place with no sale
        // found stays empty rather than guessing.
        let price: number | null;
        if (paid) price = paid.amount / 100;
        else if (matched) price = matched.grossAmount / 100;
        else if (gift || added || !input.isPaid) price = 0;
        else price = null;

        // A gift or an add moved no money: zeros. A paid seat shows its split;
        // a refunded one, or one the viewer may not see, stays blank.
        const split = paid?.split;
        const nothingMoved = !paid && !matched && (gift || added || !input.isPaid);
        const part = (cents: number | undefined): number | null =>
            split ? (cents ?? 0) / 100 : nothingMoved ? 0 : null;
        const splitCells: ExportCell[] = hasSplit ? [
            ...(hasDonation ? [part(split?.donation)] : []),
            split?.communityName ?? "",
            part(split?.community),
            part(split?.cobuntu),
            part(split?.stripe),
            part(split?.seller),
            part(split?.vat),
            part(split?.sellerExVat),
        ] : [];

        const answers = a.formAnswers?.answer || {};
        const usertag = a.usertag || a.user?.usertag;
        return [
            a.name || a.user?.name || "",
            a.email || a.user?.email || "",
            ...(hasPhone ? [a.phone || ""] : []),
            usertag ? `@${usertag}` : "",
            a.tier?.name || "",
            statusOf(a),
            how,
            price,
            paid?.currency || matched?.currency || input.eventCurrency,
            dateOf(a.registeredAt),
            dateOf(paid?.at ?? matched?.createdAt),
            ...splitCells,
            ...fieldOrder.map((id) => answerText(fieldDefs.get(id), answers[id])),
        ];
    });

    return { sheetName: input.eventName || "Attendees", columns, rows };
}
