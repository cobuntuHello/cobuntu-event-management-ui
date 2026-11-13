/**
 * What a ticket tier says about itself, read from either shape it arrives in.
 *
 * The manage page renders from the EVENT READ (core's transformEvent), where a
 * tier's ticket product is `product` (singular) and the form is the `hasForm`
 * flag. Some older reads hand over the raw Prisma row instead: `products`, and
 * `tier_forms` as ONE object (a one-to-one relation, not a list).
 *
 * The ticket cards read only the raw names, so on the event read every paid
 * ticket said "Free" and every form said "Not set" (Impact Hub Porto's
 * Food for Thought, 2026-11-13: a EUR 30 ticket with a sign-up form). One
 * reader for both shapes, used by every surface that needs these facts.
 */

/** The tier's price in the SMALLEST unit, and its currency. */
export function tierPrice(t: any): { minor: number; currency: string } {
    const product = t?.product ?? t?.products ?? null;
    return {
        minor: Number(product?.price ?? 0) || 0,
        currency: String(product?.currency || "EUR"),
    };
}

/** True when buyers of this tier fill in a sign-up form. */
export function tierHasForm(t: any): boolean {
    if (typeof t?.hasForm === "boolean") return t.hasForm;
    const f = t?.tier_forms;
    if (Array.isArray(f)) return f.some((x) => x && x.isActive !== false);
    if (f && typeof f === "object") return f.isActive !== false;
    return !!t?.formId;
}
