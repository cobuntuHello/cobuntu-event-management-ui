"use client";

import * as React from "react";
import { EVENT_WIZARD_MESSAGES_EN } from "./messages.en";

/**
 * Copy for EventCreateWizard.
 *
 * The wizard asks for every string by its FULLY QUALIFIED key
 * ("eventsUi.createEventClient.events"), the same keys the community app's
 * message bundles use. A host plugs in whatever it translates with:
 *
 *   - the community app passes next-intl's root `useTranslations()` (and its
 *     `.rich`), so every locale it ships keeps working unchanged;
 *   - a host with no i18n passes nothing and gets the English defaults
 *     (EVENT_WIZARD_MESSAGES_EN), optionally with some messages overridden.
 *
 * `rich` is separate because a few messages carry markup (<b>, <link>) that has
 * to become elements, and next-intl refuses to format those through plain `t`.
 * When a host gives `t` without `rich`, the markup is parsed out of what `t`
 * returns, which is what the built-in translator does too.
 */
export type WizardTranslationValues = Record<string, string | number | Date>;
export type WizardTranslate = (key: string, values?: WizardTranslationValues) => string;
export type WizardRichValues = Record<string, string | number | Date | ((chunks: React.ReactNode) => React.ReactNode)>;
export type WizardTranslateRich = (key: string, values?: WizardRichValues) => React.ReactNode;

export interface EventCreateWizardCopy {
  /** Resolve a fully qualified key. Defaults to the English messages. */
  t?: WizardTranslate;
  /** Resolve a key whose message carries <b>/<link> tags. Optional, see above. */
  rich?: WizardTranslateRich;
  /**
   * Overrides merged over the English defaults, same shape as
   * EVENT_WIZARD_MESSAGES_EN. Ignored when `t` is given (the host owns copy).
   */
  messages?: DeepPartial<typeof EVENT_WIZARD_MESSAGES_EN>;
  /** Locale for plural rules in the built-in translator. Default "en". */
  locale?: string;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : string };

/* ───────────────────────── a small ICU formatter ───────────────────────── */

/** Index of the brace closing the one at `open`, or -1. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** "one {# day} other {# days}" → { one: "# day", other: "# days" } */
function parseOptions(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    let key = "";
    while (i < s.length && s[i] !== "{" && !/\s/.test(s[i])) key += s[i++];
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== "{") break;
    const end = matchBrace(s, i);
    if (end < 0) break;
    out[key] = s.slice(i + 1, end);
    i = end + 1;
  }
  return out;
}

/**
 * Formats the ICU subset the wizard's messages use: `{name}`, `{n, plural, …}`
 * (with `#` and `=N`), and `{x, select, …}`. Tags like <b> pass through
 * untouched for `renderRich`.
 */
export function formatMessage(message: string, values: Record<string, unknown> = {}, locale = "en"): string {
  let out = "";
  let i = 0;
  while (i < message.length) {
    const ch = message[i];
    if (ch !== "{") {
      out += ch;
      i++;
      continue;
    }
    const end = matchBrace(message, i);
    if (end < 0) {
      out += message.slice(i);
      break;
    }
    const inner = message.slice(i + 1, end);
    const firstComma = inner.indexOf(",");
    if (firstComma < 0) {
      const name = inner.trim();
      const v = values[name];
      out += v === undefined || v === null ? `{${name}}` : v instanceof Date ? v.toLocaleString(locale) : String(v);
    } else {
      const name = inner.slice(0, firstComma).trim();
      const rest = inner.slice(firstComma + 1);
      const secondComma = rest.indexOf(",");
      const type = (secondComma < 0 ? rest : rest.slice(0, secondComma)).trim();
      const options = parseOptions(secondComma < 0 ? "" : rest.slice(secondComma + 1));
      const v = values[name];
      if (type === "plural") {
        const n = Number(v);
        let pick = options[`=${n}`];
        if (pick === undefined) {
          let cat = "other";
          try { cat = new Intl.PluralRules(locale).select(n); } catch { /* keep other */ }
          pick = options[cat] ?? options.other ?? "";
        }
        out += formatMessage(pick.replace(/#/g, String(n)), values, locale);
      } else if (type === "select") {
        out += formatMessage(options[String(v)] ?? options.other ?? "", values, locale);
      } else {
        out += v === undefined ? "" : String(v);
      }
    }
    i = end + 1;
  }
  return out;
}

/** Turns `a <b>b</b> c` into nodes, with each tag rendered by `tags[name]`. */
export function renderRich(
  text: string,
  tags: Record<string, (chunks: React.ReactNode) => React.ReactNode> = {},
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /<([a-zA-Z][\w-]*)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const render = tags[m[1]];
    parts.push(<React.Fragment key={k++}>{render ? render(m[2]) : m[2]}</React.Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function deepMerge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object") return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = v && typeof v === "object" ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** A `t` over a message tree. Missing keys come back as the key itself. */
export function createWizardTranslator(
  messages: unknown = EVENT_WIZARD_MESSAGES_EN,
  locale = "en",
): WizardTranslate {
  return (key, values) => {
    const msg = lookup(messages, key);
    return msg === undefined ? key : formatMessage(msg, values, locale);
  };
}

/* ───────────────────────── context ───────────────────────── */

interface Resolved {
  t: WizardTranslate;
  rich: WizardTranslateRich;
}

function resolve(copy: EventCreateWizardCopy | undefined): Resolved {
  const t = copy?.t ?? createWizardTranslator(deepMerge(EVENT_WIZARD_MESSAGES_EN, copy?.messages), copy?.locale);
  const rich: WizardTranslateRich = copy?.rich ?? ((key, values = {}) => {
    const plain: WizardTranslationValues = {};
    const tags: Record<string, (c: React.ReactNode) => React.ReactNode> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "function") tags[k] = v as (c: React.ReactNode) => React.ReactNode;
      else plain[k] = v;
    }
    return renderRich(t(key, plain), tags);
  });
  return { t, rich };
}

const CopyContext = React.createContext<Resolved>(resolve(undefined));

export function WizardCopyProvider({ copy, children }: { copy?: EventCreateWizardCopy; children: React.ReactNode }) {
  const t = copy?.t;
  const rich = copy?.rich;
  const messages = copy?.messages;
  const locale = copy?.locale;
  const value = React.useMemo(() => resolve({ t, rich, messages, locale }), [t, rich, messages, locale]);
  return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>;
}

export interface NamespacedT {
  (key: string, values?: WizardTranslationValues): string;
  rich: (key: string, values?: WizardRichValues) => React.ReactNode;
}

/** Namespaced view, so lifted components read `t("events")` as they did. */
export function useWizardT(namespace: string): NamespacedT {
  const { t, rich } = React.useContext(CopyContext);
  return React.useMemo(() => {
    const fn = ((key: string, values?: WizardTranslationValues) => t(`${namespace}.${key}`, values)) as NamespacedT;
    fn.rich = (key, values) => rich(`${namespace}.${key}`, values);
    return fn;
  }, [t, rich, namespace]);
}
