/**
 * The theme adapter: maps the shared form's hardcoded light/zinc palette onto
 * the host's CSS variables (--text-color, --brand-color, --bg-color).
 *
 * Lifted VERBATIM from the community app's create page, where it was an inline
 * <style> scoped to `.themed-event-form`. The wizard still injects it inline
 * (so the app's render is byte-for-byte what it was); `theme.css` in this
 * folder is the same rules as a stylesheet for hosts that would rather import
 * one, and a test keeps the two identical.
 *
 * Scoped to `.themed-event-form`, so in the app the portalled modals (mounted
 * on document.body, outside the wrapper) stay light, as they always have.
 */
export const THEME_ADAPTER_CSS = `
        .themed-event-form .text-zinc-900,
        .themed-event-form .text-zinc-800,
        .themed-event-form .text-zinc-700 { color: var(--text-color) !important; }
        .themed-event-form .text-zinc-600 { color: color-mix(in srgb, var(--text-color) 70%, transparent) !important; }
        .themed-event-form .text-zinc-500 { color: color-mix(in srgb, var(--text-color) 56%, transparent) !important; }
        .themed-event-form .text-zinc-400 { color: color-mix(in srgb, var(--text-color) 45%, transparent) !important; }
        .themed-event-form .text-zinc-300 { color: color-mix(in srgb, var(--text-color) 33%, transparent) !important; }
        /* Lighter fills — the form read too gray; these keep boxes legible
           without the heavy grey-box look (CEO). */
        .themed-event-form .bg-white { background-color: color-mix(in srgb, var(--text-color) 3.5%, transparent) !important; }
        .themed-event-form .bg-zinc-50 { background-color: color-mix(in srgb, var(--text-color) 4%, transparent) !important; }
        .themed-event-form .bg-zinc-100 { background-color: color-mix(in srgb, var(--text-color) 6%, transparent) !important; }
        .themed-event-form .bg-zinc-200 { background-color: color-mix(in srgb, var(--text-color) 8.5%, transparent) !important; }
        .themed-event-form .bg-zinc-50\\/30 { background-color: color-mix(in srgb, var(--text-color) 3%, transparent) !important; }
        .themed-event-form .ring-zinc-100 { --tw-ring-color: color-mix(in srgb, var(--text-color) 12%, transparent) !important; }
        .themed-event-form .border-zinc-200,
        .themed-event-form .border-zinc-300 { border-color: color-mix(in srgb, var(--text-color) 18%, transparent) !important; }
        .themed-event-form .divide-zinc-100 > :not([hidden]) ~ :not([hidden]) { border-color: color-mix(in srgb, var(--text-color) 10%, transparent) !important; }
        .themed-event-form input,
        .themed-event-form textarea { color: var(--text-color) !important; }
        .themed-event-form input::placeholder,
        .themed-event-form .placeholder\\:text-zinc-300::placeholder { color: color-mix(in srgb, var(--text-color) 33%, transparent) !important; }
        .themed-event-form .hover\\:bg-zinc-50\\/50:hover,
        .themed-event-form .hover\\:bg-zinc-50:hover,
        .themed-event-form .hover\\:bg-zinc-100:hover { background-color: color-mix(in srgb, var(--text-color) 5%, transparent) !important; }
        .themed-event-form .hover\\:bg-zinc-200\\/70:hover { background-color: color-mix(in srgb, var(--text-color) 9%, transparent) !important; }
        /* Switch ON → brand; keep the thumb bright for contrast. */
        .themed-event-form [data-state="checked"] { background-color: var(--brand-color, #18181b) !important; }
        .themed-event-form [role="switch"] > span { background-color: #ffffff !important; }
      `;

/**
 * Extra rules for the THEMED PORTAL ROOT (decision 3: on a site, the
 * description / location / tags / tickets modals are branded too).
 *
 * Inside the form a surface is a translucent tint over the page; a modal
 * floats over a dimmed backdrop, so the same tint would be see-through. Here
 * the tints mix toward --bg-color instead of transparent, giving opaque panels
 * in the host's palette. Only emitted when a theme is set; the app never gets
 * these.
 */
export const THEMED_PORTAL_CSS = `
.cbt-wizard-portal.themed-event-form .bg-white { background-color: var(--bg-color, #ffffff) !important; }
.cbt-wizard-portal.themed-event-form .bg-zinc-50 { background-color: color-mix(in srgb, var(--text-color) 4%, var(--bg-color, #ffffff)) !important; }
.cbt-wizard-portal.themed-event-form .bg-zinc-100 { background-color: color-mix(in srgb, var(--text-color) 6%, var(--bg-color, #ffffff)) !important; }
.cbt-wizard-portal.themed-event-form .bg-zinc-200 { background-color: color-mix(in srgb, var(--text-color) 8.5%, var(--bg-color, #ffffff)) !important; }
.cbt-wizard-portal.themed-event-form [role="dialog"] { color: var(--text-color); }
`;

/**
 * Applied when a host passes `theme`: fonts and text colour on the wizard root,
 * which in the app come from the app's own global styles.
 */
export const THEMED_ROOT_CSS = `
.cbt-event-wizard--themed { color: var(--text-color); font-family: var(--body-font, inherit); }
.cbt-event-wizard--themed h1, .cbt-event-wizard--themed h2, .cbt-event-wizard--themed h3 { font-family: var(--heading-font, var(--body-font, inherit)); }
`;
