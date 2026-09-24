/**
 * The cap on a listing's NAME, mirrored from the server.
 *
 * Authority is `services/core/src/shared/utils/listingNameLimits.ts`
 * (LISTING_NAME_MAX_LENGTH). This is the client copy, the same arrangement the
 * tier editor uses with tierTextLimits. Keep the two in sync.
 *
 * Why the cap exists: `events.name` is unbounded Postgres `text`, and a
 * seller pasted an entire Instagram caption into a listing name on a live community -- 1399
 * characters, emoji and trailing URL included. It rendered as an <h1> and
 * pushed the price and buy buttons below the fold.
 *
 * Why 100: the event rename modal and edit drawer already capped names at 100.
 * Creation simply never honoured it.
 */
export const LISTING_NAME_MAX = 100;

/**
 * How much headroom is left when the counter appears: the last fifth of the
 * budget. A seller typing an ordinary title never sees a number; it shows up
 * only once the length is genuinely in play.
 */
export const NAME_COUNTER_FROM = Math.round(LISTING_NAME_MAX * 0.2);

/**
 * Deliberately NOT a `maxLength` attribute.
 *
 * `maxLength` silently swallows keystrokes and, worse, silently truncates a
 * PASTE -- which is exactly how the 1399-character title was created. A seller
 * pasting a caption would have got its first 100 characters, cut mid-sentence,
 * with nothing on screen to say anything had been dropped. A counter plus a
 * blocked submit tells them what happened and lets them choose what to cut.
 */
export function listingNameTooLong(name: string): boolean {
    return name.trim().length > LISTING_NAME_MAX;
}
