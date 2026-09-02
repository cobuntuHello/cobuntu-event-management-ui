/**
 * The tokens this package styles with, so a shared view can sit inside either
 * host app and look like it belongs there.
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * These views hardcoded `bg-white`, `bg-zinc-50`, `text-zinc-900`,
 * `border-zinc-200`. That is correct in the admin, which is deliberately
 * neutral — and wrong in the community app, where a community picks its own
 * colours. A grey card dropped onto W35's pink page reads as a piece of a
 * different product, because it is: it is the admin's card.
 *
 * ── How this works, and why it needs no per-app flag ───────────────────────
 *
 * Every token is `var(--x, <the value the admin has today>)`.
 *
 * The community app defines these variables from the community's theme. The
 * admin defines NONE of them — it has no `--brand-color` at all — so every
 * fallback fires and the admin renders byte-identically to before. There is no
 * "am I in the community app" check to get wrong, and no prop to thread: the
 * host answers the question just by existing.
 *
 * ── Why some values are translucent grey rather than a token ───────────────
 *
 * A card's fill and its hairlines have to work over an unknown background. A
 * flat `#fafafa` is a grey rectangle on a pink page; `rgba(128,128,128,0.06)`
 * is the same *veil* over whatever is behind it, so it tints with the host
 * instead of covering it. That is the pattern the community app already uses
 * for its own nested blocks.
 */

export const theme = {
  /** Page-level card. Follows the host's surface colour. */
  cardBg: "var(--bg-color, #ffffff)",

  /** A block nested inside a card — the add/edit form, a skeleton row. */
  insetBg: "rgba(128,128,128,0.06)",

  /** Hover wash on a row. Deliberately weaker than insetBg. */
  hoverBg: "rgba(128,128,128,0.04)",

  /** Hairline between rows, and the ring around a card. */
  border: "rgba(128,128,128,0.16)",
  borderSubtle: "rgba(128,128,128,0.10)",

  /** Body text. */
  text: "var(--text-color, #18181b)",

  /** The primary action. THE token that carries the community's identity. */
  brand: "var(--brand-color, #18181b)",
  /** Text on top of `brand`. */
  onBrand: "#ffffff",

  /** Corner radii, so a community with square or very round cards is honoured. */
  cardRadius: "var(--card-radius, 16px)",
  buttonRadius: "var(--button-radius, 8px)",
} as const;

/**
 * Muted text, as an opacity rather than a lighter grey.
 *
 * `text-zinc-400` is a fixed grey that disappears on a dark theme and clashes
 * on a coloured one. Fading the host's own text colour stays legible against
 * whatever background it was chosen for.
 */
export const muted = (opacity: number) => ({ color: theme.text, opacity });
