"use client";

import { useState } from "react";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

/**
 * Recipient = one staged person (member or unresolved email).
 *
 * Discriminated by `kind`:
 *   - 'member'  → resolved to an existing Cobuntu user account
 *   - 'email'   → unresolved string; will be invited as a guest
 *
 * `state` (state-aware UI):
 *   - 'available'       → ready to add/invite, default chip
 *   - 'attending'       → already an APPROVED attendee; can't add again
 *   - 'invited'         → already has a PENDING invitation
 *   - 'cancelled'       → previously had a CANCELLED attendance — fair game
 *   - 'invalid_email'   → string failed validation
 *
 * `personalizedMessage`:
 *   - undefined → use the shared default message
 *   - string    → per-recipient override; chip shows a ✏️ badge
 */
export type Recipient =
    | {
        kind: "member";
        usertag: string;
        name: string;
        profileImage?: string | null;
        email?: string | null;
        state: "available" | "attending" | "invited" | "cancelled";
        personalizedMessage?: string;
    }
    | {
        kind: "email";
        email: string;
        // Resolution: when an entered email matches a known user, the
        // SmartRecipientInput may upgrade the chip to a member chip
        // (with avatar). Until that happens the chip stays "email".
        state: "available" | "attending" | "invited" | "cancelled" | "invalid_email";
        personalizedMessage?: string;
    };

export function recipientKey(r: Recipient): string {
    return r.kind === "member" ? `m:${r.usertag}` : `e:${r.email.toLowerCase()}`;
}

interface Props {
    recipient: Recipient;
    /** Hides the personalize affordance (Add mode never personalizes). */
    allowPersonalize?: boolean;
    /** Called when the user opens the inline editor for this recipient. */
    onTogglePersonalize?: () => void;
    /** Called when the user removes the chip from the staged set. */
    onRemove: () => void;
}

export function RecipientChip({
    recipient,
    allowPersonalize = false,
    onTogglePersonalize,
    onRemove,
}: Props) {
    // Defensive: never render an undefined recipient. Returning null
    // here would orphan the surrounding flex gap; explicit early-return.
    if (!recipient) return null;

    // Pkg-portable avatar rendering: consumer injects its own via
    // config.UserAvatar; otherwise the minimal initials fallback ships
    // with the pkg.
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

    const stateStyle = getStateStyle(recipient.state);
    const isDisabled = recipient.state === "attending" || recipient.state === "invalid_email";

    return (
        <div
            className={[
                "group inline-flex items-center gap-2 max-w-full",
                "rounded-full border pl-1 pr-1 py-1",
                "transition-colors",
                stateStyle.container,
                isDisabled ? "opacity-70" : "",
            ].join(" ")}
        >
            {/* Avatar (member) or envelope icon (email) */}
            {recipient.kind === "member" ? (
                <UserAvatar
                    user={{
                        name: recipient.name,
                        usertag: recipient.usertag,
                        email: recipient.email || undefined,
                        profileImage: recipient.profileImage || undefined,
                    }}
                    className="w-6 h-6 shrink-0"
                />
            ) : (
                <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                </div>
            )}

            {/* Label */}
            <span className="text-[13px] font-medium text-zinc-900 truncate max-w-[160px]">
                {recipient.kind === "member" ? recipient.name : recipient.email}
            </span>

            {/* State badge (compact, only when non-available) */}
            {stateStyle.badge && (
                <span className={["text-[10px] font-medium px-1.5 py-0.5 rounded-full", stateStyle.badge].join(" ")}>
                    {stateStyle.badgeLabel}
                </span>
            )}

            {/* Personalized indicator */}
            {recipient.personalizedMessage && (
                <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700"
                    title="This recipient has a personalized message"
                >
                    ✏️ personalized
                </span>
            )}

            {/* Personalize affordance */}
            {allowPersonalize && !isDisabled && onTogglePersonalize && (
                <button
                    onClick={onTogglePersonalize}
                    aria-label="Personalize message for this recipient"
                    className="w-6 h-6 shrink-0 rounded-full hover:bg-white/80 flex items-center justify-center text-zinc-500 hover:text-zinc-700 cursor-pointer transition-colors"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                </button>
            )}

            {/* Remove */}
            <button
                onClick={onRemove}
                aria-label="Remove recipient"
                className="w-6 h-6 shrink-0 rounded-full hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-zinc-400 cursor-pointer transition-colors"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}

function getStateStyle(state: Recipient["state"]) {
    switch (state) {
        case "attending":
            return {
                container: "bg-emerald-50 border-emerald-200",
                badge: "bg-emerald-100 text-emerald-700",
                badgeLabel: "✓ attending",
            };
        case "invited":
            return {
                container: "bg-amber-50 border-amber-200",
                badge: "bg-amber-100 text-amber-700",
                badgeLabel: "⚠ invited",
            };
        case "cancelled":
            return {
                container: "bg-zinc-50 border-zinc-200",
                badge: "bg-zinc-100 text-zinc-600",
                badgeLabel: "cancelled",
            };
        case "invalid_email":
            return {
                container: "bg-red-50 border-red-200",
                badge: "bg-red-100 text-red-700",
                badgeLabel: "⚠ invalid",
            };
        case "available":
        default:
            return {
                container: "bg-zinc-50 border-zinc-200 hover:bg-zinc-100",
                badge: null as string | null,
                badgeLabel: "",
            };
    }
}

/**
 * Compact RFC 5322-ish email validator. Accepts the common cases the
 * input/paste flow needs to support; rejects obviously malformed
 * strings ("foo@bar", whitespace, missing TLD).
 */
export function isValidEmail(s: string): boolean {
    if (!s || s.length > 254) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

interface InlinePersonalizeEditorProps {
    recipientName: string;
    initial: string;
    onSave: (msg: string) => void;
    onCancel: () => void;
}

/**
 * Inline expansion editor that replaces the chip's row when the user
 * clicks ✏️. Drops the legacy InviteGuestsModal's full-window
 * "compose step" — same flexibility, never leaves the modal context.
 */
export function InlinePersonalizeEditor({
    recipientName,
    initial,
    onSave,
    onCancel,
}: InlinePersonalizeEditorProps) {
    const [value, setValue] = useState(initial);
    const MAX = 500;
    return (
        <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
            <div className="flex items-baseline justify-between">
                <p className="text-[12px] font-medium text-zinc-700">
                    Personalize for <span className="text-zinc-900">{recipientName}</span>
                </p>
                <p className="text-[11px] text-zinc-400">{value.length}/{MAX}</p>
            </div>
            <textarea
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, MAX))}
                placeholder="Override the shared message just for this recipient..."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 text-sm text-zinc-900 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 resize-none placeholder:text-zinc-400"
            />
            <div className="flex items-center justify-end gap-2">
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 text-[12px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    onClick={() => onSave(value.trim())}
                    className="px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                    Done
                </button>
            </div>
        </div>
    );
}
