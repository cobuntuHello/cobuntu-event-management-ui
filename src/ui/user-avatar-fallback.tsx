"use client";

/**
 * Minimal initials-based avatar used as the default when the consuming
 * app doesn't inject a `UserAvatar` via EventManagementConfig.
 *
 * Apps with their own avatar style (seeded persona SVGs, profile-image
 * fallbacks, etc.) should pass `config.UserAvatar = MyAvatar` so the
 * shared components match the surrounding visual style. This fallback
 * exists so the components render something sensible out of the box.
 */

import * as React from "react";

interface FallbackProps {
    user: {
        name?: string | null;
        imageUrl?: string | null;
        profileImage?: string | null;
        usertag?: string | null;
        email?: string | null;
        id?: string | null;
    };
    className?: string;
}

function pickInitial(u: FallbackProps["user"]): string {
    const src = u.name ?? u.usertag ?? u.email ?? u.id ?? "";
    const trimmed = src.trim();
    if (!trimmed) return "?";
    return trimmed[0]!.toUpperCase();
}

export function UserAvatarFallback({ user, className = "h-10 w-10" }: FallbackProps): React.ReactElement {
    const img = user.imageUrl ?? user.profileImage ?? null;
    if (img) {
        return (
            <img
                src={img}
                alt={user.name ?? ""}
                className={`shrink-0 rounded-full object-cover ${className}`}
            />
        );
    }
    return (
        <div
            className={`shrink-0 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center text-sm font-medium ${className}`}
            aria-label={user.name ?? undefined}
        >
            {pickInitial(user)}
        </div>
    );
}
