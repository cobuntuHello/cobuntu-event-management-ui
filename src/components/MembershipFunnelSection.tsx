"use client";

import * as React from "react";
import { useEventManagementConfig } from "../config";

/**
 * MembershipFunnelSection — host's config UI for the event-as-membership-funnel
 * feature. Renders in the event editor (OverviewView in cobuntu-admin and the
 * equivalent surface in cobuntu-community-app's /manage routes).
 *
 * Plan: docs/features/event-membership-funnel.md
 *
 * One radio per mode (None / EMBED / APPLY_LINK). When the event isn't
 * eligible — viewability/accessibility not Public, or community is
 * INVITE_ONLY — renders a blocked-state explainer instead, with an
 * "Open event settings" button that calls `onRequestEditSettings` so the
 * parent can pop its existing EditEventDrawer.
 *
 * The buyer-side card lives in cobuntu-community-app (FunnelCard) because
 * the buyer's event detail UI isn't in this shared package — only the
 * host's config UI is shared.
 */

export interface MembershipFunnelSectionEvent {
    id: string;
    accessibility?: string | null;          // 'PUBLIC' | 'MEMBERS_ONLY'
    viewability?: string | null;            // 'PUBLIC' | 'MEMBERS_ONLY'
    funnelMode?: "EMBED" | "APPLY_LINK" | null;
    funnelEmbedCode?: string | null;
    funnelEmbedProvider?: string | null;
}

export interface MembershipFunnelSectionCommunity {
    name: string;
    accessibility?: string | null;          // 'OPEN' | 'APPLICATION' | 'INVITE_ONLY'
    /** Count of membership segments configured. When 0, APPLY_LINK shows an
     *  inline warning (doesn't block save). */
    segmentCount?: number;
}

export interface MembershipFunnelSectionProps {
    event: MembershipFunnelSectionEvent;
    communityTag: string;
    community: MembershipFunnelSectionCommunity;
    onSaved: () => void;
    onRequestEditSettings: () => void;
    showToast?: (msg: string) => void;
}

type Mode = "NONE" | "EMBED" | "APPLY_LINK";

function modeFromEvent(event: MembershipFunnelSectionEvent): Mode {
    if (event.funnelMode === "EMBED") return "EMBED";
    if (event.funnelMode === "APPLY_LINK") return "APPLY_LINK";
    return "NONE";
}

interface BlockReason {
    code: "VIEWABILITY" | "ACCESSIBILITY" | "INVITE_ONLY";
    title: string;
    body: string;
}

function detectBlockReason(
    event: MembershipFunnelSectionEvent,
    community: MembershipFunnelSectionCommunity,
): BlockReason | null {
    if (community.accessibility === "INVITE_ONLY") {
        return {
            code: "INVITE_ONLY",
            title: "Funnel not available — community is invite-only",
            body:
                "There's no public application path for buyers to follow. Change your community accessibility to Open or Application to enable the funnel.",
        };
    }
    if (event.viewability && event.viewability !== "PUBLIC") {
        return {
            code: "VIEWABILITY",
            title: "Event viewability is set to Members only",
            body:
                "Non-members can't see this event, so there's no one to convert. Change the event viewability to Public to enable the funnel.",
        };
    }
    if (event.accessibility && event.accessibility !== "PUBLIC") {
        return {
            code: "ACCESSIBILITY",
            title: "Event accessibility is set to Members only",
            body:
                "Only existing members can RSVP, so there are no non-members to convert. Change the event accessibility to Public to enable the funnel.",
        };
    }
    return null;
}

/**
 * Client-side embed sanity check — mirrors the BE parser. Returns an error
 * string when the input doesn't look like a supported provider iframe; null
 * when it's plausibly valid. The BE is the source of truth on save — this
 * just surfaces the same errors inline before submit.
 */
function validateEmbedCode(code: string): string | null {
    if (!code.trim()) {
        return "Paste the iframe code from your form provider.";
    }
    const srcMatch = code.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) {
        return "Couldn't find an iframe URL in that code. Paste the full <iframe src=\"...\"></iframe> snippet.";
    }
    const url = srcMatch[1];
    if (!url.startsWith("https://")) {
        return "Embed URL must use HTTPS.";
    }
    let host: string;
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return "Embed URL is not a valid URL.";
    }
    const isTally = host === "tally.so" || host.endsWith(".tally.so");
    const isJotform =
        host === "form.jotform.com" ||
        host.endsWith(".jotform.com") ||
        host.endsWith(".jotform.io");
    const isTypeform = host === "typeform.com" || host.endsWith(".typeform.com");
    if (!isTally && !isJotform && !isTypeform) {
        return "Only Tally, JotForm, and Typeform are supported in v1.";
    }
    return null;
}

function detectProviderLabel(code: string): string | null {
    const srcMatch = code.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) return null;
    let host: string;
    try {
        host = new URL(srcMatch[1]).hostname.toLowerCase();
    } catch {
        return null;
    }
    if (host === "tally.so" || host.endsWith(".tally.so")) return "Tally";
    if (
        host === "form.jotform.com" ||
        host.endsWith(".jotform.com") ||
        host.endsWith(".jotform.io")
    ) {
        return "JotForm";
    }
    if (host === "typeform.com" || host.endsWith(".typeform.com")) return "Typeform";
    return null;
}

export function MembershipFunnelSection({
    event,
    communityTag,
    community,
    onSaved,
    onRequestEditSettings,
    showToast,
}: MembershipFunnelSectionProps) {
    const { apiBaseUrl, authHeaders } = useEventManagementConfig();

    const initialMode = modeFromEvent(event);
    const [mode, setMode] = React.useState<Mode>(initialMode);
    const [embedCode, setEmbedCode] = React.useState(event.funnelEmbedCode ?? "");
    const [saving, setSaving] = React.useState(false);
    const [serverError, setServerError] = React.useState<string | null>(null);

    const blocked = detectBlockReason(event, community);

    const isDirty =
        mode !== initialMode ||
        (mode === "EMBED" && embedCode !== (event.funnelEmbedCode ?? ""));

    // Warn when leaving EMBED with an existing pasted code that will be wiped.
    const willDiscardEmbed =
        initialMode === "EMBED" &&
        mode !== "EMBED" &&
        (event.funnelEmbedCode ?? "").trim().length > 0;

    const embedValidationError = mode === "EMBED" ? validateEmbedCode(embedCode) : null;
    const providerLabel = mode === "EMBED" ? detectProviderLabel(embedCode) : null;

    const segmentCount = community.segmentCount ?? 0;
    const applyLinkNoSegments = mode === "APPLY_LINK" && segmentCount === 0;

    const saveDisabled = !isDirty || saving || (mode === "EMBED" && !!embedValidationError);

    async function handleSave() {
        if (saveDisabled) return;
        setSaving(true);
        setServerError(null);
        try {
            const body =
                mode === "NONE"
                    ? { mode: null }
                    : mode === "EMBED"
                      ? { mode: "EMBED", embedCode }
                      : { mode: "APPLY_LINK" };
            const res = await fetch(
                `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/funnel`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify(body),
                },
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setServerError(err.error || "Failed to save funnel");
                showToast?.(err.error || "Failed to save funnel");
                return;
            }
            showToast?.("Funnel saved");
            onSaved();
        } catch (e: any) {
            const msg = e?.message || "Failed to save funnel";
            setServerError(msg);
            showToast?.(msg);
        } finally {
            setSaving(false);
        }
    }

    if (blocked) {
        return (
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 p-5">
                <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">Membership funnel</h3>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-3">
                    <p className="text-[13px] font-semibold text-amber-900 mb-1">
                        🚫 {blocked.title}
                    </p>
                    <p className="text-[12px] text-amber-800 leading-relaxed">{blocked.body}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-4 mb-3">
                    <p className="text-[12px] font-medium text-zinc-700 mb-1">What this does</p>
                    <p className="text-[12px] text-zinc-600 leading-relaxed">
                        Adds an optional "Apply to join {community.name}" card below the Reserve
                        button on this event's page, so non-members can opt-in to apply for
                        community membership alongside (or instead of) their event RSVP.
                    </p>
                </div>
                {blocked.code !== "INVITE_ONLY" && (
                    <button
                        type="button"
                        onClick={onRequestEditSettings}
                        className="text-[13px] font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 cursor-pointer"
                    >
                        Open event settings →
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 p-5">
            <div className="mb-3">
                <h3 className="text-[15px] font-semibold text-zinc-900">Membership funnel</h3>
                <p className="text-[12px] text-zinc-500 mt-1">
                    What appears below the Reserve card for non-members of {community.name}.
                </p>
            </div>

            <div className="space-y-2 mb-4">
                <ModeOption
                    selected={mode === "NONE"}
                    onClick={() => setMode("NONE")}
                    title="None"
                    subtitle="No funnel card shown."
                />
                <ModeOption
                    selected={mode === "EMBED"}
                    onClick={() => setMode("EMBED")}
                    title="External form"
                    subtitle="Tally, JotForm, or Typeform — paste the iframe code."
                />
                <ModeOption
                    selected={mode === "APPLY_LINK"}
                    onClick={() => setMode("APPLY_LINK")}
                    title="Link to apply page"
                    subtitle={`Sends buyers to your /apply page where they pick a tier and apply.`}
                />
            </div>

            {mode === "EMBED" && (
                <div className="mb-4 space-y-2">
                    <label className="block text-[12px] font-medium text-zinc-700">
                        Paste the embed code from your form provider:
                    </label>
                    <textarea
                        value={embedCode}
                        onChange={(e) => setEmbedCode(e.target.value)}
                        placeholder={`<iframe src="https://tally.so/embed/..."></iframe>`}
                        rows={5}
                        className="w-full font-mono text-[12px] rounded-lg border border-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                    {embedCode && !embedValidationError && providerLabel && (
                        <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            ✓ {providerLabel} form detected
                        </p>
                    )}
                    {embedCode && embedValidationError && (
                        <p className="text-[11px] text-red-700 bg-red-50 px-2 py-1 rounded">
                            ⚠ {embedValidationError}
                        </p>
                    )}
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Where to find this: <strong>Tally</strong> → Share → Embed code ·{" "}
                        <strong>JotForm</strong> → Publish → Embed ·{" "}
                        <strong>Typeform</strong> → Share → Embed.
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                        ⓘ Your form, your data. Cobuntu just displays it — submissions go directly
                        to your form provider.
                    </p>
                </div>
            )}

            {applyLinkNoSegments && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                        ⚠ {community.name} has no membership tiers yet. Buyers will see an empty
                        /apply page. Set up a tier before enabling this.
                    </p>
                </div>
            )}

            {willDiscardEmbed && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                        ⚠ Switching modes will discard your pasted embed code.
                    </p>
                </div>
            )}

            {serverError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-4">
                    <p className="text-[11px] text-red-800">{serverError}</p>
                </div>
            )}

            <div className="flex items-center justify-end gap-2">
                {isDirty && !saving && (
                    <button
                        type="button"
                        onClick={() => {
                            setMode(initialMode);
                            setEmbedCode(event.funnelEmbedCode ?? "");
                            setServerError(null);
                        }}
                        className="px-3 py-1.5 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveDisabled}
                    className="px-4 py-1.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                    {saving ? "Saving..." : willDiscardEmbed ? "Discard and save" : "Save"}
                </button>
            </div>
        </div>
    );
}

function ModeOption({
    selected,
    onClick,
    title,
    subtitle,
}: {
    selected: boolean;
    onClick: () => void;
    title: string;
    subtitle: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                selected
                    ? "border-zinc-900 bg-zinc-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50/50"
            }`}
        >
            <span
                className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-zinc-900" : "border-zinc-300"
                }`}
            >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />}
            </span>
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-zinc-900">{title}</span>
                <span className="block text-[12px] text-zinc-500 mt-0.5">{subtitle}</span>
            </span>
        </button>
    );
}
