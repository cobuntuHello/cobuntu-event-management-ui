"use client";

import { useCallback, useEffect, useRef } from "react";
import type { EventDraftSnapshot, SaveDraftResult } from "./types";

/**
 * Saving an unfinished wizard while someone types. Lifted from the community
 * app (lib/useAutosaveDraft.ts) with the fetch replaced by the host's
 * `saveDraft`; the rules are unchanged:
 *
 * 1. DUPLICATE ROWS: the wizard mints the row id and the endpoint upserts on
 *    it, so racing saves converge on one row.
 * 2. OUT-OF-ORDER WRITES: single-flight plus a dirty flag; at most one request
 *    in the air, and a change during it saves again when it lands.
 * 3. LOSING THE LAST EDIT: flushed on `pagehide` with keepalive, and on unmount.
 *
 * A 409 means the row is no longer a draft (it was created while they typed),
 * so autosave stops for good rather than retrying a refusal per keystroke.
 * Anything else fails quietly and the next change retries. No spinner, no
 * toast: a background save is not something anyone asked to hear about.
 */
export interface AutosaveDraftOptions {
  draftId: string;
  save: (id: string, snapshot: EventDraftSnapshot, opts?: { keepalive?: boolean }) => Promise<SaveDraftResult>;
  /** Read at fire time: the form lives in a ref and does not re-render per key. */
  getSnapshot: () => EventDraftSnapshot | null;
  /** Read at fire time: the endpoint refuses a nameless draft. */
  isEnabled: () => boolean;
  delayMs?: number;
  onSaved?: (id: string) => void;
}

const DEFAULT_DELAY_MS = 1000;

export function useAutosaveDraft({
  draftId,
  save,
  getSnapshot,
  isEnabled,
  delayMs = DEFAULT_DELAY_MS,
  onSaved,
}: AutosaveDraftOptions): { schedule: () => void; flush: () => Promise<void> } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const dirty = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const latest = useRef({ draftId, save, getSnapshot, isEnabled, onSaved });
  latest.current = { draftId, save, getSnapshot, isEnabled, onSaved };
  const stopped = useRef(false);

  const send = useCallback(async (opts: { keepalive?: boolean } = {}): Promise<void> => {
    const { draftId: id, save: put, getSnapshot: read, isEnabled: allowed, onSaved: saved } = latest.current;
    if (stopped.current || !allowed()) return;
    const snap = read();
    if (!snap) return;
    const body = JSON.stringify(snap);
    if (body === lastSaved.current) return;
    if (inFlight.current) {
      dirty.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const res = await put(id, snap, opts.keepalive ? { keepalive: true } : undefined);
      if (res.ok) {
        lastSaved.current = body;
        saved?.(id);
      } else if (res.status === 409) {
        stopped.current = true;
      }
    } catch {
      /* Offline or aborted. The next change retries. */
    } finally {
      inFlight.current = false;
      if (dirty.current) {
        dirty.current = false;
        void send();
      }
    }
  }, []);

  const schedule = useCallback(() => {
    if (stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void send(); }, delayMs);
  }, [delayMs, send]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    const flush = () => { void send({ keepalive: true }); };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [send]);

  const flush = useCallback(() => send(), [send]);
  return { schedule, flush };
}
