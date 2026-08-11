"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Inline, always-visible preview of the actual invitation email a host
 * will send. Replaces the legacy EmailPreviewDrawer — no side panel, no
 * modal-stacking, no extra clicks. Renders below the message textarea
 * inside the InviteGuestsModal body.
 *
 * What it renders:
 *   - The community's CUSTOMIZED `event` template if one is saved
 *     (`storefrontConfig.emailTemplates.event`), OR
 *   - The platform default from @cobuntu/email-schemas otherwise.
 *
 * Variables interpolated server-side from real event/community data
 * (logo, brand colors, fonts, event name, date, location, etc.), with
 * the host's custom message + recipient name patched in live as they
 * type. Same rendering pipeline the production email send uses.
 *
 * Update behavior:
 *   - Re-fetches with a 300ms debounce on `customMessage` change.
 *   - Re-fetches on tab focus (`window` 'focus' event) — if the host
 *     edited the template in another tab via the Customize page, the
 *     preview catches up the next time they come back to this modal.
 *
 * Footer reveals one of two CTAs depending on whether a customization
 * already exists:
 *   - "Customize email template →" (no customization)
 *   - "Edit email template →"      (customization exists)
 *
 * Both deep-link to `/[communityTag]/customize?section=emails&edit=event`
 * which the EmailsSection auto-opens for the host. Hidden when the
 * viewer doesn't have permission to customize (we render a quiet info
 * line instead).
 */
interface Props {
    communityTag: string;
    eventId: string;
    customMessage: string;
    recipientName: string;
    authHeaders: () => Record<string, string>;
    apiBaseUrl: string;
    /** Whether the current user can open the Customize editor. */
    canCustomize: boolean;
}

export function InlineEmailPreview({
    communityTag,
    eventId,
    customMessage,
    recipientName,
    authHeaders,
    apiBaseUrl,
    canCustomize,
}: Props) {
    const [html, setHtml] = useState<string | null>(null);
    const [isCustomized, setIsCustomized] = useState<boolean>(false);
    const [fetchKey, setFetchKey] = useState(0);

    // Debounced re-fetch on message change.
    useEffect(() => {
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const url = `${apiBaseUrl}/api/communities/${communityTag}/events/${eventId}/email-templates/event/preview`
                    + `?customMessage=${encodeURIComponent(customMessage)}`
                    + `&recipientName=${encodeURIComponent(recipientName)}`;
                const res = await fetch(url, { headers: authHeaders() });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (typeof data?.html === "string") {
                    setHtml(data.html);
                    setIsCustomized(!!data.isCustomized);
                }
            } catch { /* silent — the previous render stays */ }
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customMessage, recipientName, fetchKey, communityTag, eventId, apiBaseUrl]);

    // Re-fetch on tab focus. Hosts who pop out to Customize → save →
    // return to this tab see the updated branding without a manual
    // refresh. The fetchKey nudge re-runs the effect above without
    // duplicating its body here.
    useEffect(() => {
        function onFocus() { setFetchKey((k) => k + 1); }
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, []);

    const customizeHref = `/${communityTag}/customize?section=emails&edit=event`;

    return (
        <div>
            <div className="flex items-baseline justify-between mb-2">
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Email preview</p>
                <p className="text-[11px] text-zinc-400">Recipient: {recipientName}</p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden">
                {/* Email chrome — fake browser-like outer container so the
                    rendered email feels like an email, not a snippet. */}
                <div className="bg-white border-b border-zinc-100 px-4 py-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-200" />
                    <span className="w-2 h-2 rounded-full bg-zinc-200" />
                    <span className="w-2 h-2 rounded-full bg-zinc-200" />
                    <span className="ml-auto text-[10px] text-zinc-400 uppercase tracking-wider">Email</span>
                </div>
                {/* The actual rendered template. Comes from the BE preview
                    endpoint which renders against the community's actual
                    customized template (falls back to platform default).
                    Safe to dangerouslySetInnerHTML — the BE renderer is
                    the same one that produces real sent emails. */}
                <div className="max-h-[420px] overflow-y-auto bg-white">
                    {html != null ? (
                        <div className="px-3 py-4" dangerouslySetInnerHTML={{ __html: html }} />
                    ) : (
                        <PreviewSkeleton />
                    )}
                </div>
                {/* Footer with customize CTA */}
                <div className="bg-white border-t border-zinc-100 px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCustomized ? "bg-emerald-500" : "bg-zinc-300"}`} />
                        <p className="text-[11px] text-zinc-500 truncate">
                            {isCustomized ? "Using your custom template" : "Using the default template"}
                        </p>
                    </div>
                    {canCustomize ? (
                        <Link
                            href={customizeHref}
                            className="text-[12px] font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer whitespace-nowrap"
                        >
                            {isCustomized ? "Edit template →" : "Customize template →"}
                        </Link>
                    ) : (
                        <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                            Ask a community admin to customize
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function PreviewSkeleton() {
    return (
        <div className="px-3 py-4 space-y-3 animate-pulse">
            <div className="h-3 w-2/3 bg-zinc-100 rounded" />
            <div className="h-5 w-4/5 bg-zinc-100 rounded" />
            <div className="h-px bg-zinc-100" />
            <div className="h-3 w-full bg-zinc-50 rounded" />
            <div className="h-3 w-5/6 bg-zinc-50 rounded" />
            <div className="h-9 bg-zinc-100 rounded" />
        </div>
    );
}
