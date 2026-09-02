/**
 * How long an agenda item lasts.
 *
 * ── Why this is shared rather than computed where it is shown ──────────────
 *
 * The duration has to appear in two places that live in different repos: the
 * manage view in this package, and the member-facing event page in the
 * community app. Both start from the same two timestamps, and "end minus
 * start" is exactly the kind of two-line calculation that ends up subtly
 * different — one rounding, one flooring, one forgetting that a missing end
 * time is possible — and then two screens disagree about the same item.
 *
 * ── Why it returns a number and not a string ───────────────────────────────
 *
 * The community app is translated into ten locales and formats through
 * next-intl; this package's own UI is English. A shared function that returned
 * "5 min" would either hardcode English into a translated surface or need a
 * bag of label overrides threaded through it. Returning minutes lets each side
 * write its own words while sharing the one thing worth sharing: the number,
 * and the rules about when there isn't one.
 */

/**
 * Minutes between two ISO instants, or null when there is no honest answer.
 *
 * Null rather than 0 for every bad case, so a caller renders NOTHING rather
 * than a confident "0 min":
 *
 *   no end time — legal, older items were saved without one
 *   either timestamp unparseable
 *   end at or before start — bad data, or an item that crosses midnight,
 *     which the agenda form cannot express (it builds both times on the
 *     event's own date) so the value would be a negative, not a long item
 */
export function agendaDurationMinutes(
    startISO: string | null | undefined,
    endISO: string | null | undefined,
): number | null {
    if (!startISO || !endISO) return null;

    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    const minutes = Math.round((end - start) / 60000);
    return minutes > 0 ? minutes : null;
}

/**
 * Minutes split into hours and minutes, for a caller that wants to write
 * "1h 30m" rather than "90 min".
 *
 * Kept beside the calculation so both sides agree on where the hour boundary
 * falls, while each still chooses its own words.
 */
export function splitDuration(totalMinutes: number): { hours: number; minutes: number } {
    return {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
    };
}

/**
 * The English rendering, used by this package's own UI.
 *
 * Under an hour reads as plain minutes; at or over an hour the minutes only
 * appear when there are any, so a round ninety minutes is "1h 30m" and a round
 * two hours is "2h" rather than "2h 0m".
 */
export function formatDurationShort(totalMinutes: number): string {
    const { hours, minutes } = splitDuration(totalMinutes);
    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}
