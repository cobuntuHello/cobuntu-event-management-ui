"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventT } from "../create-wizard/i18n";

/**
 * What the host app gets to draw the link as a QR code.
 *
 * `url` is exactly the link this modal shares and copies, so the code can
 * never point somewhere the buttons do not.
 */
export interface ShareQrSlotArgs {
  url: string;
  /** The event's name: the picture's headline and the file's name. */
  name: string;
  /** The loaded event, for the host app's second line (a price, a date). */
  event: any;
}

/**
 * Renders the QR code block under the event's name. A render function rather
 * than a component this package owns: the community app already has the
 * branded code (round dots, the community's icon in the middle) and its QR
 * library, and this package cannot import from the app. Omitted, the modal
 * has no code, which is what the admin app gets.
 */
export type RenderShareQr = (args: ShareQrSlotArgs) => ReactNode;

interface Props {
  event: any;
  communityTag: string;
  onClose: () => void;
  renderQr?: RenderShareQr;
}

/*
 * The theme-neutral greys the community app's share sheets use (its
 * ProfileShareSheet and ShareEventModal), so this modal reads as the same
 * sheet on any community theme and on the admin's plain white.
 */
const DIVIDER = "1px solid rgba(128,128,128,0.12)";
const FIELD_BG = "rgba(128,128,128,0.08)";
const PILL_BG = "rgba(128,128,128,0.15)";

/**
 * The manage page's Share modal, laid out as the community app's profile
 * share sheet: the event at the top (and, where the host app draws one, its
 * QR code), then "Share via" with the networks in their own colours, then
 * "Or copy link". A close X replaces the old Close text button.
 */
export function ShareModal({ event, communityTag, onClose, renderQr }: Props) {
  const [copied, setCopied] = useState(false);
  const t = useEventT("eventsUi.manageUi.shareModal");
  const tc = useEventT("eventsUi.manageUi.overviewCommon");
  const eventUrl = `https://${communityTag}.cobuntu.com/events/${event.slug || event.id}`;
  const name: string = event.name || "";

  // A "Copied" left over from another link must not claim this one is copied.
  useEffect(() => { setCopied(false); }, [eventUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* navigator.clipboard can throw in insecure contexts; the link stays visible */ }
  }

  const message = t("emailBody", { url: eventUrl });
  const targets: ShareTargetProps[] = [
    { label: "WhatsApp", tone: "#25D366", href: `https://wa.me/?text=${encodeURIComponent(message)}`, icon: <WhatsAppIcon /> },
    { label: "Facebook", tone: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}`, icon: <FacebookIcon /> },
    { label: "X", tone: "#000000", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(name)}&url=${encodeURIComponent(eventUrl)}`, icon: <XIcon /> },
    { label: "LinkedIn", tone: "#0A66C2", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(eventUrl)}`, icon: <LinkedInIcon /> },
    { label: t("email"), tone: "#5b6470", href: `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(message)}`, icon: <EmailIcon />, isMailto: true },
  ];

  return (
    <ModalShell onClose={onClose} className="relative">
      {/* The modal has no visible title (the event is the headline, as on the
          profile sheet), so screen readers still hear what it is. */}
      <h3 className="sr-only">{t("title")}</h3>
      <CloseButton label={tc("close")} onClick={onClose} />

      {renderQr ? (
        /* With a code: the event over it, centred, as the profile sheet leads
           with your code. */
        <div className="flex flex-col items-center gap-3 pt-1 text-center">
          <ItemThumb imageUrl={event.bannerUrl} name={name} size={56} />
          <p className="max-w-full px-6 text-[16px] font-semibold leading-tight line-clamp-2">{name}</p>
          <div className="w-full">{renderQr({ url: eventUrl, name, event })}</div>
        </div>
      ) : (
        <div className="flex items-center gap-3 pr-9">
          <ItemThumb imageUrl={event.bannerUrl} name={name} size={48} />
          <p className="min-w-0 flex-1 text-[15px] font-semibold leading-tight line-clamp-2">{name}</p>
        </div>
      )}

      <div className="-mx-6 my-4" style={{ borderTop: DIVIDER }} />

      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-3">{t("shareVia")}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {targets.map((s) => <ShareTarget key={s.label} {...s} />)}
      </div>

      <div className="-mx-6 my-4" style={{ borderTop: DIVIDER }} />

      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-2">{t("orCopyLink")}</p>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: FIELD_BG, borderRadius: "var(--card-radius, 8px)" }}>
        <span className="text-[12px] flex-1 min-w-0 truncate font-mono opacity-80" title={eventUrl}>{eventUrl}</span>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="text-[11px] px-2.5 py-1 rounded-[var(--button-radius,0.375rem)] font-medium transition-colors shrink-0 cursor-pointer"
          style={{
            background: copied ? "rgba(34,197,94,0.15)" : PILL_BG,
            color: copied ? "rgb(34,197,94)" : "var(--text-color, #18181b)",
          }}
        >
          {copied ? tc("copied") : tc("copy")}
        </button>
      </div>
    </ModalShell>
  );
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
      style={{ background: FIELD_BG, color: "var(--text-color, #18181b)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/** The event's banner, or its initial on the community colour when it has none. */
function ItemThumb({ imageUrl, name, size }: { imageUrl?: string | null; name: string; size: number }) {
  const box = { width: size, height: size, borderRadius: "var(--thumb-radius, 12px)" };
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className="shrink-0 object-cover" style={box} />;
  }
  return (
    <div
      aria-hidden="true"
      className="shrink-0 flex items-center justify-center text-[16px] font-semibold"
      style={{ ...box, background: "var(--brand-color, #18181b)", color: "var(--brand-contrast, #ffffff)" }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

interface ShareTargetProps {
  label: string;
  /** The network's own colour, so five destinations do not read as one control. */
  tone: string;
  href: string;
  icon: ReactNode;
  isMailto?: boolean;
}

function ShareTarget({ label, tone, href, icon, isMailto = false }: ShareTargetProps) {
  return (
    <a
      href={href}
      target={isMailto ? undefined : "_blank"}
      rel={isMailto ? undefined : "noopener noreferrer"}
      className="flex flex-col items-center gap-1.5 py-2 no-underline transition-transform hover:scale-105 active:scale-95"
      style={{ color: "var(--text-color, #18181b)" }}
    >
      <span className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: tone, color: "#ffffff" }}>
        {icon}
      </span>
      <span className="text-[10.5px] opacity-70 truncate max-w-full">{label}</span>
    </a>
  );
}

/* The networks' own marks (Simple Icons paths), the same ones the community
   app's share sheets draw. */

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.85 11.85 0 0012 0C5.4 0 0 5.4 0 12c0 2.1.55 4.16 1.6 5.97L0 24l6.18-1.6A11.85 11.85 0 0012 24c6.6 0 12-5.4 12-12 0-3.2-1.25-6.21-3.48-8.52zM12 21.8c-1.85 0-3.66-.5-5.25-1.44l-.38-.22-3.65.95.97-3.56-.24-.39A9.78 9.78 0 012.2 12c0-5.4 4.4-9.8 9.8-9.8 2.62 0 5.08 1.02 6.93 2.87a9.74 9.74 0 012.87 6.93c0 5.4-4.4 9.8-9.8 9.8zm5.36-7.32c-.3-.15-1.74-.86-2.01-.96-.27-.1-.46-.15-.66.15s-.76.96-.93 1.15c-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.38-1.47a9 9 0 01-1.66-2.07c-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.07-.15-.66-1.6-.9-2.19-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.51.07-.78.37-.27.3-1.02 1-1.02 2.44s1.05 2.83 1.2 3.03c.15.2 2.07 3.16 5.02 4.43.7.3 1.25.48 1.68.62.7.22 1.34.19 1.85.12.56-.08 1.74-.71 1.99-1.4.24-.69.24-1.28.17-1.4-.07-.13-.27-.2-.57-.35z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.26 2.36 4.26 5.43v6.31zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}
