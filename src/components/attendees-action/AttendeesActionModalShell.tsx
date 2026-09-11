"use client";

/**
 * The attendee-action modal shell now lives in @cobuntu/management-ui-shared as
 * ActionModalShell.
 *
 * WHY IT MOVED: it was the reason the host flow felt right on a phone —
 * full-bleed, swipe-to-dismiss, unsaved guard — and the product package's
 * co-seller flow, doing the same job, did not. Copying it there would have made
 * a third divergent copy of a surface that already had three. It is the same
 * component, consumed twice.
 *
 * THIS FILE STAYS as a re-export because four modals in this package import it
 * by this name (AddAttendeesModal, InviteGuestsModal, PromoteAttendeeModal,
 * PostSendCelebration). Renaming their imports would have put unrelated churn
 * in a PR about co-sellers, and this name is the right one here anyway: in the
 * events package these really are the attendee-action modals.
 *
 * Behaviour is unchanged, including the discard prompt — the shared shell keeps
 * this exact wording as its default.
 */
export {
    ActionModalShell as AttendeesActionModalShell,
    type ActionModalShellProps,
} from "@cobuntu/management-ui-shared";
