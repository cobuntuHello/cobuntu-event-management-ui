import type { Recipient } from "@cobuntu/management-ui-shared";

/**
 * A staged list, in the shape the two event endpoints accept.
 *
 * ── Why not the shared userIdsOf/emailsOf ───────────────────────────────────
 *
 * Those split on the USER ID, which is right for every endpoint keyed by one:
 * hosts, collaborators, access grants. These two are not. Both
 * `POST /add-attendees` and `POST /invitations` take `usertags` and `emails`,
 * so the split has to be on the usertag or a member arrives as a bare address
 * and gets treated as somebody with no account.
 *
 * Order matters: a member who also has an address must go in `usertags` only.
 * Sending both is one person, two invitations, two emails.
 */
export function recipientsToApi(recipients: Recipient[]): {
    usertags: string[];
    emails: string[];
} {
    const usertags: string[] = [];
    const emails: string[] = [];
    for (const r of recipients) {
        if (r.usertag) usertags.push(r.usertag);
        else if (r.email?.trim()) emails.push(r.email.trim());
        /* Neither: an account with no handle and no address. Nothing the
           endpoint could look them up by, so they are dropped rather than
           sent as an empty string the server would 400 on. */
    }
    return { usertags, emails };
}

/**
 * The per-recipient overrides, in the shape `sendInvitations` reads.
 *
 * The server picks the override when one is present and falls back to
 * `customMessage` otherwise, so only people who actually have their own note
 * belong in this array.
 */
export function perRecipientMessages(
    recipients: Recipient[],
): Array<{ usertag?: string; email?: string; message: string }> {
    const out: Array<{ usertag?: string; email?: string; message: string }> = [];
    for (const r of recipients) {
        const message = r.note?.trim();
        if (!message) continue;
        if (r.usertag) out.push({ usertag: r.usertag, message });
        else if (r.email?.trim()) out.push({ email: r.email.trim(), message });
    }
    return out;
}
