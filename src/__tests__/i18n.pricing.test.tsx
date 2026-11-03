import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventManagementConfigProvider, type EventManagementConfig } from "../config";
import { MemberPricingSection } from "../components/MemberPricingSection";
import { SchedulingSection } from "../components/SchedulingSection";
import { TierRow } from "../components/PriceEditModal/TierRow";
import { TierEditView } from "../components/PriceEditModal/TierEditView";
import { blankTier, validateTier } from "../components/PriceEditModal/helpers";
import type { MemberPricingRow } from "../components/PriceEditModal/member-pricing";
import { WizardCopyProvider } from "../create-wizard/i18n";

/**
 * The pricing surface (tier modal, tier rows, member pricing, sales window,
 * validation messages) reads its words from the HOST's translator.
 *
 * A pt-PT community opening the pricing modal used to get English on every
 * label and every validation toast. Each string now asks for a fully
 * qualified key under eventsUi.manageUi.*, resolved by EventManagementConfig.t
 * when the host passes one and by the package's English otherwise.
 */

const base: EventManagementConfig = {
  apiBaseUrl: "",
  authHeaders: () => ({}),
  stripeConnectUrl: () => "",
  navigate: () => {},
};
const hostT = (key: string, values?: Record<string, unknown>) =>
  `PT:${key}${values && "count" in values ? `:${values.count}` : ""}`;

function withHost(ui: React.ReactNode) {
  return render(<EventManagementConfigProvider value={{ ...base, t: hostT }}>{ui}</EventManagementConfigProvider>);
}
/*
 * The copy provider with no host `t` renders English AND resets getEventT's
 * render-time mirror, which a previous test left pointing at hostT. (A config
 * provider without `t` deliberately installs nothing, so it cannot reset it.)
 */
function english(ui: React.ReactNode) {
  return render(
    <WizardCopyProvider>
      <EventManagementConfigProvider value={base}>{ui}</EventManagementConfigProvider>
    </WizardCopyProvider>,
  );
}

const row: MemberPricingRow = {
  segmentId: "seg-1",
  segmentName: "VIPs",
  enabled: true,
  mode: "PERCENT_OFF",
  value: "20",
  priority: "0",
  initial: { enabled: false, mode: "PERCENT_OFF", value: "", priority: "0" },
};

const scheduleDraft = { publishedAt: null, autoScheduleEnabled: true, salesStartAt: "", salesEndAt: "" };

describe("pricing surface with a host translator", () => {
  it("MemberPricingSection asks the host for its heading and counts", () => {
    withHost(
      <MemberPricingSection state={{ loading: false, error: null, rows: [row] }} onRowChange={() => {}} currencySymbol="€" />,
    );
    expect(screen.getByText("PT:eventsUi.manageUi.memberPricingSection.heading")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.memberPricingSection.unsavedCount:1")).toBeInTheDocument();
    expect(screen.queryByText("Member pricing")).not.toBeInTheDocument();
  });

  it("SchedulingSection asks the host for its labels", () => {
    withHost(<SchedulingSection draft={scheduleDraft} onChange={() => {}} />);
    expect(screen.getAllByText("PT:eventsUi.manageUi.schedulingSection.autoSchedule").length).toBeGreaterThan(0);
    expect(screen.getByText("PT:eventsUi.manageUi.schedulingSection.noDates")).toBeInTheDocument();
  });

  it("TierRow and TierEditView ask the host for their words", () => {
    const tier = { ...blankTier("EUR", 1), name: "", publishedAt: null, _idx: 0 };
    withHost(<TierRow t={tier} onSelect={() => {}} />);
    expect(screen.getByText("PT:eventsUi.manageUi.tierRow.unnamedTier")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.tierRow.draft")).toBeInTheDocument();
  });

  it("TierEditView's locked banner goes through the host (rich)", () => {
    const tier = { ...blankTier("EUR", 1), id: "tier-1", salesCount: 3 };
    withHost(<TierEditView t={tier} onUpdate={() => {}} onEnterStep={() => {}} />);
    expect(screen.getByText("PT:eventsUi.manageUi.tierEditView.lockedBanner:3")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.tierEditView.advanced")).toBeInTheDocument();
  });

  it("validation messages (non-hook helpers) follow the mounted host translator", () => {
    withHost(<SchedulingSection draft={scheduleDraft} onChange={() => {}} />);
    expect(validateTier({ ...blankTier(), name: "" })).toBe("PT:eventsUi.manageUi.pricingHelpers.tierNameRequired");
  });
});

describe("pricing surface without a host translator (English defaults)", () => {
  it("MemberPricingSection renders today's English", () => {
    english(
      <MemberPricingSection state={{ loading: false, error: null, rows: [row] }} onRowChange={() => {}} currencySymbol="€" />,
    );
    expect(screen.getByText("Member pricing")).toBeInTheDocument();
    expect(screen.getByText("1 unsaved")).toBeInTheDocument();
    expect(screen.getByText("percent off")).toBeInTheDocument();
  });

  it("SchedulingSection renders today's English", () => {
    english(<SchedulingSection draft={scheduleDraft} onChange={() => {}} />);
    expect(screen.getByText("Set a sales-open or sales-close date, or turn off auto-schedule.")).toBeInTheDocument();
    expect(screen.getByText("This window takes effect once the tier is published.")).toBeInTheDocument();
  });

  it("TierEditView renders the locked banner and field count in English", () => {
    const tier = { ...blankTier("EUR", 1), id: "tier-1", salesCount: 1 };
    english(<TierEditView t={tier} onUpdate={() => {}} onEnterStep={() => {}} />);
    expect(screen.getByText("1 ticket sold")).toBeInTheDocument();
    expect(screen.getByText(/price, currency and the installment plan are locked/)).toBeInTheDocument();
    expect(screen.getByText("Always on")).toBeInTheDocument();
  });

  it("validation and default tier names stay English", () => {
    english(<SchedulingSection draft={scheduleDraft} onChange={() => {}} />);
    expect(validateTier({ ...blankTier(), name: "" })).toBe("Tier name is required");
    expect(blankTier("EUR", 1).name).toBe("Standard");
    expect(blankTier("EUR", 2).name).toBe("Tier 2");
  });
});
