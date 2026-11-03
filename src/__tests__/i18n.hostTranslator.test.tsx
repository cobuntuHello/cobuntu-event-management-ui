import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { EventManagementConfigProvider, type EventManagementConfig } from "../config";
import { useEventT, getEventT } from "../create-wizard/i18n";
import { EVENT_MANAGEMENT_MESSAGES_EN, flattenMessageKeys } from "../i18n/messages.en";
import { EVENT_WIZARD_MESSAGES_EN } from "../create-wizard/messages.en";

/**
 * The manage surface speaks the HOST's language.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 *
 * Only the create wizard took a translator. Everything else the community app
 * renders from this package (the manage page, its views and modals, the event
 * form inside the wizard, the pricing modal, attendees, hosts, listings,
 * activity) was hard-coded English, so a pt-PT community such as Finance
 * Social Club saw English on every one of those screens.
 *
 * ── The contract ────────────────────────────────────────────────────────────
 *
 * Components ask for FULLY QUALIFIED keys. The host passes its translator as
 * EventManagementConfig.t (the community app: next-intl's root
 * useTranslations()); with none, the package renders its own English.
 */

const baseConfig: EventManagementConfig = {
  apiBaseUrl: "",
  authHeaders: () => ({}),
  stripeConnectUrl: () => "",
  navigate: () => {},
};

function Probe({ k = "failedToUpdate" }: { k?: string }) {
  const t = useEventT("eventsUi.manageUi.config");
  return <p>{t(k)}</p>;
}

describe("host translator on EventManagementConfig", () => {
  it("resolves the fully qualified key through the host's t", () => {
    const seen: string[] = [];
    const t = (key: string) => {
      seen.push(key);
      return `PT:${key}`;
    };
    render(
      <EventManagementConfigProvider value={{ ...baseConfig, t }}>
        <Probe />
      </EventManagementConfigProvider>,
    );
    expect(screen.getByText("PT:eventsUi.manageUi.config.failedToUpdate")).toBeInTheDocument();
    expect(seen).toContain("eventsUi.manageUi.config.failedToUpdate");
  });

  it("falls back to the built-in English with no host t", () => {
    render(
      <EventManagementConfigProvider value={baseConfig}>
        <Probe />
      </EventManagementConfigProvider>,
    );
    expect(screen.getByText("Failed to update")).toBeInTheDocument();
  });

  it("renders English with no provider at all", () => {
    render(<Probe />);
    expect(screen.getByText("Failed to update")).toBeInTheDocument();
  });

  it("an inner provider WITHOUT t keeps the outer host translator (the wizard nests one)", () => {
    const t = (key: string) => `PT:${key}`;
    render(
      <EventManagementConfigProvider value={{ ...baseConfig, t }}>
        <EventManagementConfigProvider value={baseConfig}>
          <Probe />
        </EventManagementConfigProvider>
      </EventManagementConfigProvider>,
    );
    expect(screen.getByText("PT:eventsUi.manageUi.config.failedToUpdate")).toBeInTheDocument();
  });

  it("getEventT mirrors the last provider for non-hook helpers", () => {
    const t = (key: string) => `PT:${key}`;
    render(
      <EventManagementConfigProvider value={{ ...baseConfig, t }}>
        <Probe />
      </EventManagementConfigProvider>,
    );
    expect(getEventT("eventsUi.manageUi.config")("failedToUpdate")).toBe(
      "PT:eventsUi.manageUi.config.failedToUpdate",
    );
  });
});

/*
 * EVERY literal key a component asks for exists in the English defaults.
 *
 * Scraped from the source, not hand-listed: a missing key renders AS THE KEY,
 * so a typo ships as "eventsUi.manageUi.agendaView.titel" on a live page and no
 * type check notices. Each `t("...")` resolves against the nearest
 * `useEventT("ns")` / `getEventT("ns")` declared above it in the same file.
 * Computed keys (`t(kind)`) are skipped, they are not knowable statically.
 */
describe("every requested key has an English default", () => {
  const SRC = join(__dirname, "..");
  const tree = { ...EVENT_WIZARD_MESSAGES_EN, ...EVENT_MANAGEMENT_MESSAGES_EN } as Record<string, unknown>;
  // The two trees share `eventsUi`; merge that branch rather than replace it.
  tree.eventsUi = {
    ...(EVENT_WIZARD_MESSAGES_EN as unknown as { eventsUi: object }).eventsUi,
    ...EVENT_MANAGEMENT_MESSAGES_EN.eventsUi,
  };
  const known = new Set(flattenMessageKeys(tree));

  function files(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e !== "__tests__") out.push(...files(p));
      } else if (/\.tsx?$/.test(e)) out.push(p);
    }
    return out;
  }

  const blank = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/\S/g, " ")).replace(/(^|[^:])\/\/.*$/gm, (m) => m.replace(/\S/g, " "));

  it("resolves", () => {
    const missing: string[] = [];
    for (const f of files(SRC)) {
      if (f.includes("create-wizard")) continue; // the wizard has its own app-side guard
      const src = blank(readFileSync(f, "utf8"));
      const decls = [...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:useEventT|getEventT|useWizardT)\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map(
        (m) => ({ at: m.index!, v: m[1], ns: m[2] }),
      );
      for (const d of new Set(decls.map((d) => d.v))) {
        const re = new RegExp(`\\b${d}(?:\\.rich)?\\(\\s*["'\`]([\\w.]+)["'\`]`, "g");
        for (const m of src.matchAll(re)) {
          const decl = decls.filter((x) => x.v === d && x.at < m.index!).pop();
          if (!decl) continue;
          const key = `${decl.ns}.${m[1]}`;
          if (!known.has(key)) missing.push(`${f.replace(SRC, "src")}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
