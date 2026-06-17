"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { type Recipient, recipientKey, isValidEmail } from "./RecipientChip";

/**
 * The single input that replaces the legacy "Members / Email / CSV" tabs.
 *
 * Responsibilities:
 *   - Type a partial name OR @usertag  → autocomplete dropdown of matching
 *     members (avatar, name, state badge).
 *   - Type an email                    → press Tab / comma / Enter to
 *                                        chip it. Pasting a comma- or
 *                                        newline-separated list batch-
 *                                        parses into chips in one pass.
 *   - Resolution                       → unresolved email is upgraded to
 *                                        a member chip when its address
 *                                        matches a known user.
 *   - State awareness                  → "Already attending" rows are
 *                                        disabled (can't double-add) and
 *                                        "Already invited" rows surface
 *                                        an amber state in Invite mode.
 *
 * The CSV upload sits below as a small `↑ Import CSV` link (drop the
 * tab; keep the affordance).
 */

export interface Member {
    usertag: string;
    name: string;
    email?: string | null;
    profileImage?: string | null;
    role?: string;
    // Optional state hint provided by the parent. The input shows the
    // state badge inline on the autocomplete row + chip.
    state?: "available" | "attending" | "invited" | "cancelled";
}

interface Props {
    /** All members of the community (for autocomplete + email upgrade). */
    allMembers: Member[];
    /**
     * Set of usertags / lowercased emails of recipients that are
     * currently staged. Used to dedupe and to grey out matching
     * autocomplete rows so the host can't add the same person twice.
     */
    stagedKeys: Set<string>;
    /**
     * Mode-dependent state lookup. When mode is 'invite', members who
     * already have a pending invitation surface as 'invited'.
     */
    mode: "add" | "invite";
    placeholder?: string;
    /** Called when the user adds one or more recipients. */
    onAdd: (recipients: Recipient[]) => void;
    /** Visually called out in the autocomplete row footer. */
    onOpenCsvImport: () => void;
}

export function SmartRecipientInput({
    allMembers,
    stagedKeys,
    mode,
    placeholder = "Add by name, @usertag, or email...",
    onAdd,
    onOpenCsvImport,
}: Props) {
    // Pkg-portable avatar rendering.
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

    const [value, setValue] = useState("");
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Build the suggestion list. Filter by typed query, exclude staged
    // recipients, cap at SUGGESTION_LIMIT for performance + scannability.
    const SUGGESTION_LIMIT = 8;
    const suggestions = useMemo(() => {
        const q = value.trim().replace(/^@/, "").toLowerCase();
        if (!q) return [];
        const matches: Member[] = [];
        for (const m of allMembers) {
            if (matches.length >= SUGGESTION_LIMIT) break;
            const key = `m:${m.usertag}`;
            if (stagedKeys.has(key)) continue;
            const hay = `${m.name || ""} ${m.usertag || ""} ${m.email || ""}`.toLowerCase();
            if (hay.includes(q)) matches.push(m);
        }
        return matches;
    }, [value, allMembers, stagedKeys]);

    // Member-email index for upgrading raw email chips → member chips.
    const emailToMember = useMemo(() => {
        const map = new Map<string, Member>();
        for (const m of allMembers) {
            if (m.email) map.set(m.email.toLowerCase(), m);
        }
        return map;
    }, [allMembers]);

    // ⌘+K from anywhere focuses the input. The shell's keyboard
    // handler short-circuits — this one is scoped to mounted state.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                inputRef.current?.focus();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Click-outside closes the suggestion popover (without clearing
    // the input — user might want to keep typing).
    useEffect(() => {
        function onClickAway(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setFocused(false);
            }
        }
        document.addEventListener("mousedown", onClickAway);
        return () => document.removeEventListener("mousedown", onClickAway);
    }, []);

    function commitMember(m: Member) {
        // Narrow to the member-state union (the broader Recipient.state
        // includes 'invalid_email', which can only apply to email-kind
        // chips, never members).
        const state: "available" | "attending" | "invited" | "cancelled" = m.state ?? "available";
        onAdd([
            {
                kind: "member",
                usertag: m.usertag,
                name: m.name,
                email: m.email ?? null,
                profileImage: m.profileImage ?? null,
                state,
            },
        ]);
        setValue("");
        setHighlightIdx(0);
    }

    function commitRawText(raw: string) {
        // Batch parse: split by commas / semicolons / newlines and let
        // anything that looks like an email through as an email chip.
        // Members can only be added via the autocomplete path; we don't
        // do bare-name fuzzy-resolve on commit (too error-prone).
        const tokens = raw
            .split(/[\s,;]+/g)
            .map((t) => t.trim())
            .filter(Boolean);
        if (tokens.length === 0) return;

        const next: Recipient[] = [];
        for (const t of tokens) {
            const tokenLower = t.toLowerCase();
            if (!isValidEmail(t)) {
                // Push as invalid_email — the user sees a red chip and
                // can edit-or-remove it. Better than silently dropping.
                next.push({ kind: "email", email: t, state: "invalid_email" });
                continue;
            }
            const matched = emailToMember.get(tokenLower);
            if (matched) {
                const k = `m:${matched.usertag}`;
                if (stagedKeys.has(k) || next.some((r) => recipientKey(r) === k)) continue;
                next.push({
                    kind: "member",
                    usertag: matched.usertag,
                    name: matched.name,
                    email: matched.email ?? null,
                    profileImage: matched.profileImage ?? null,
                    state: matched.state ?? "available",
                });
            } else {
                const k = `e:${tokenLower}`;
                if (stagedKeys.has(k) || next.some((r) => recipientKey(r) === k)) continue;
                next.push({ kind: "email", email: t, state: "available" });
            }
        }
        if (next.length > 0) onAdd(next);
        setValue("");
        setHighlightIdx(0);
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        const open = focused && suggestions.length > 0;
        if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            const dir = e.key === "ArrowDown" ? 1 : -1;
            setHighlightIdx((i) => {
                const n = suggestions.length;
                return ((i + dir) % n + n) % n;
            });
            return;
        }
        if (open && e.key === "Enter") {
            e.preventDefault();
            commitMember(suggestions[highlightIdx]!);
            return;
        }
        if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
            if (value.trim()) {
                e.preventDefault();
                commitRawText(value);
            }
            return;
        }
        if (e.key === "Backspace" && value === "") {
            // Parent owns the staged list — let the chip handle its own
            // removal. We just blur to give the chip strip keyboard
            // focus. Implemented as a custom event so the parent can
            // hook in if it wants.
            const ev = new CustomEvent("smart-recipient-input:backspace-empty");
            window.dispatchEvent(ev);
        }
    }

    function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
        // Multi-line / multi-token paste → batch-commit.
        const text = e.clipboardData.getData("text") || "";
        if (/[,;\n]/.test(text)) {
            e.preventDefault();
            commitRawText(text);
        }
    }

    return (
        <div ref={wrapperRef} className="relative">
            <label className="sr-only" htmlFor="smart-recipient-input">Add recipients</label>
            <div className={[
                "flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5",
                focused ? "border-zinc-400 ring-2 ring-zinc-900/10" : "border-zinc-200",
                "transition-colors",
            ].join(" ")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    id="smart-recipient-input"
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setHighlightIdx(0); }}
                    onFocus={() => setFocused(true)}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 min-w-0 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
                />
                {value && (
                    <button
                        onClick={() => { setValue(""); inputRef.current?.focus(); }}
                        aria-label="Clear"
                        className="w-6 h-6 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 cursor-pointer shrink-0"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Helper row */}
            <div className="flex items-center justify-between mt-1.5 px-1">
                <p className="text-[11px] text-zinc-400 leading-none">
                    Type, paste, or press Enter / comma to add. <kbd className="px-1 py-0.5 rounded bg-zinc-100 text-[10px]">⌘K</kbd> to focus.
                </p>
                <button
                    onClick={onOpenCsvImport}
                    className="text-[11px] text-zinc-500 hover:text-zinc-700 cursor-pointer flex items-center gap-1 leading-none"
                >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Import CSV
                </button>
            </div>

            {/* Autocomplete popover */}
            {focused && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 z-10 rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden">
                    <ul className="max-h-[280px] overflow-y-auto">
                        {suggestions.map((m, idx) => {
                            const isHi = idx === highlightIdx;
                            const isDisabled = m.state === "attending";
                            return (
                                <li key={m.usertag}>
                                    <button
                                        type="button"
                                        // mousedown commits before blur fires — Tab/Click both work.
                                        onMouseDown={(e) => { e.preventDefault(); if (!isDisabled) commitMember(m); }}
                                        onMouseEnter={() => setHighlightIdx(idx)}
                                        disabled={isDisabled}
                                        className={[
                                            "w-full flex items-center gap-3 px-3 py-2 text-left",
                                            "cursor-pointer transition-colors",
                                            isHi && !isDisabled ? "bg-zinc-50" : "bg-white",
                                            isDisabled ? "opacity-60 cursor-not-allowed" : "hover:bg-zinc-50",
                                        ].join(" ")}
                                    >
                                        <UserAvatar user={m} className="w-7 h-7 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-zinc-900 truncate">{m.name || "Unknown"}</p>
                                            <p className="text-[11px] text-zinc-400 truncate">@{m.usertag}</p>
                                        </div>
                                        {/* State badge inline */}
                                        {m.state === "attending" && (
                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">✓ attending</span>
                                        )}
                                        {m.state === "invited" && mode === "invite" && (
                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">⚠ invited</span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
