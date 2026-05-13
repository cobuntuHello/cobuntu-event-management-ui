"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";

interface Props {
  event: any;
  communityTag: string;
  onClose: () => void;
}

export function ShareModal({ event, communityTag, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const eventUrl = `https://${communityTag}.cobuntu.com/events/${event.slug || event.id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* navigator.clipboard can throw in insecure contexts; silently ignore */ }
  }

  const shares = [
    { name: "Facebook", onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}`, "_blank"),
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
    { name: "X", onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(event.name)}&url=${encodeURIComponent(eventUrl)}`, "_blank"),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
    { name: "LinkedIn", onClick: () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(eventUrl)}`, "_blank"),
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
    { name: "Email", onClick: () => window.open(`mailto:?subject=${encodeURIComponent(event.name)}&body=${encodeURIComponent(`Check out this event: ${eventUrl}`)}`),
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> },
    { name: copied ? "Copied!" : "Copy", onClick: copy,
      icon: copied
        ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> },
  ];

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Share event</h3>
      <div className="grid grid-cols-5 gap-3 mb-5">
        {shares.map(s => (
          <button key={s.name} onClick={s.onClick} className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-zinc-50 cursor-pointer transition-colors">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600">{s.icon}</div>
            <span className="text-[10px] text-zinc-500">{s.name}</span>
          </button>
        ))}
      </div>
      <button onClick={copy} className="w-full flex items-center gap-2 p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer text-left">
        <p className="text-xs text-zinc-500 truncate flex-1">{eventUrl}</p>
        <span className="text-[12px] font-medium text-zinc-600 shrink-0">{copied ? "Copied!" : "Copy"}</span>
      </button>
      <div className="flex justify-end mt-4">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Close</button>
      </div>
    </ModalShell>
  );
}
