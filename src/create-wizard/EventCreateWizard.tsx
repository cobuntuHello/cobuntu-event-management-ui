"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import {
  resolveSubmitActions,
  type SubmitAction,
  resolveCreateSteps, isFinalStep, nextStep, previousStep, clampStep, stepHeaderKeys, resumeStep,
  type CreateStepId,
  CreateStepRail, StepPane, WizardButton,
  CreatedModal,
  resolveCreateOutcome, type CreateOutcome,
  ListingAccessStep,
  fromTierAccessValue, PackagePicker, type TierAccessValue,
  PortalContainerProvider,
} from "@cobuntu/management-ui-shared";
import { EventForm, type EventFormData } from "../components/EventForm";
import { EventManagementConfigProvider } from "../config";
import { draftTiersToCreatePayload, donationDraftToPayload } from "../components/PriceEditModal/helpers";
import { LISTING_NAME_MAX, listingNameTooLong } from "../lib/listingNameLimit";
import type { CategoryOption } from "../components/CategoryPickerRow";
import { WizardCopyProvider, useWizardT } from "./i18n";
import { WizardNavProvider, DefaultLink, browserNavigate } from "./navigation";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { eventDraftToForm, draftOwnership } from "./draftResume";
import { communityCannotTakeCommission } from "./communityCommissionGate";
import { ResumeDraftStep } from "./ResumeDraftStep";
import { OwnershipToggle } from "./OwnershipToggle";
import { FirstTimeCreatorModal } from "./FirstTimeCreatorModal";
import { FormErrorBanner, FormNoticeBanner } from "./banners";
import { Breadcrumb, HowItWorksButton } from "./chrome";
import { THEME_ADAPTER_CSS, THEMED_PORTAL_CSS, THEMED_ROOT_CSS } from "./theme";
import type {
  EventCreateWizardProps,
  EventCreateWizardTheme,
  EventDraftRow,
  EventDraftSummary,
  EventFeePackage,
  EventWizardTier,
} from "./types";

/**
 * The member "host an event" wizard, as a component any host can render.
 *
 * Lifted from the community app's /events/new (CreateEventClient.tsx) with its
 * markup and classes UNCHANGED, so the app renders pixel-identically and an
 * embedding site gets the same flow. What changed is only what it is plugged
 * into: the network is `transport`, links and navigation are `navigation`,
 * words are `copy`. See types.ts and the plan doc
 * (cobuntu-backend-monorepo docs/features/embed-event-wizard.md).
 *
 * The flow, unchanged:
 *   - steps are DERIVED (resolveCreateSteps): a member gets details, pricing,
 *     policies and the arrangement; a leader (EVENTS_CREATE) first chooses who
 *     hosts it, and community ownership swaps the arrangement for access;
 *   - unfinished drafts are offered as a first step, autosave keeps the row
 *     current, and creating finishes THAT row rather than leaving an orphan;
 *   - the submit buttons come from resolveSubmitActions (the state the listing
 *     will LAND in, never the role), and the paid-tier gates check the member's
 *     own Stripe and whether the community can collect its commission;
 *   - host-defined `extraSteps` sit after the last Cobuntu step, before submit.
 *     Their answers go to `onDone`, never to Cobuntu.
 */
export function EventCreateWizard(props: EventCreateWizardProps) {
  const { transport, navigation, copy, theme, portal = "inline", googleMapsApiKey } = props;

  /*
   * Resuming in place, for hosts without their own ?draft= route. The app
   * passes onResumeDraft and navigates, so this stays null there and the
   * draft comes in through props exactly as before.
   */
  const [localResume, setLocalResume] = useState<{ id: string; step: string | null } | null>(null);
  const draftId = localResume?.id ?? props.draftId ?? null;
  const draftStepFromUrl = localResume ? localResume.step : props.draftStepFromUrl ?? null;

  // EVENTS_CREATE: from the host when it knows, else asked once.
  const [askedPermission, setAskedPermission] = useState<boolean | undefined>(undefined);
  const knowsPermission = props.canCreateForCommunity !== undefined;
  useEffect(() => {
    if (knowsPermission) return;
    let cancelled = false;
    transport.permissions()
      .then((p) => { if (!cancelled) setAskedPermission(!!p?.eventsCreate); })
      .catch(() => { if (!cancelled) setAskedPermission(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowsPermission]);
  const isLeader = props.canCreateForCommunity ?? askedPermission ?? false;

  /*
   * Drafts: from the host when it resolved them before render (the app, on the
   * server), else listed here. Either way the wizard waits for the answer before
   * deciding its first step: showing the form and then swapping in the Continue
   * step is the exact flicker the server-resolved list was introduced to end.
   */
  const knowsDrafts = props.initialDrafts !== undefined;
  const [listedDrafts, setListedDrafts] = useState<EventDraftSummary[] | null>(null);
  useEffect(() => {
    if (knowsDrafts || draftId) return;
    let cancelled = false;
    transport.listDrafts()
      .then((list) => { if (!cancelled) setListedDrafts(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setListedDrafts([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowsDrafts, draftId]);
  const drafts = props.initialDrafts ?? listedDrafts;
  const ready = (draftId || drafts !== null) && (knowsPermission || askedPermission !== undefined);

  const nav = useMemo(() => ({
    renderLink: navigation.renderLink ?? ((p) => <DefaultLink {...p} />),
    navigate: navigation.navigate ?? browserNavigate,
  }), [navigation.renderLink, navigation.navigate]);

  // Inline portals: modals mount inside the wizard root, so the scoped
  // stylesheet and a host theme reach them. The app keeps document.body.
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const themed = !!theme;

  const body = ready ? (
    <WizardInner
      {...props}
      key={localResume?.id ?? "props"}
      draftId={draftId}
      draftStepFromUrl={draftStepFromUrl}
      isLeader={isLeader}
      drafts={drafts ?? []}
      onLocalResume={(d) => setLocalResume({ id: d.id, step: d.draftStep })}
    />
  ) : null;

  return (
    <div className={themed ? "cbt-event-wizard cbt-event-wizard--themed" : "cbt-event-wizard"} style={themeVars(theme)}>
      {themed && <style dangerouslySetInnerHTML={{ __html: THEMED_ROOT_CSS + THEMED_PORTAL_CSS }} />}
      <WizardCopyProvider copy={copy}>
        <WizardNavProvider value={nav}>
          <EventManagementConfigProvider
            value={{
              /*
               * The shared form's own calls go through the transport: tag
               * search, tag create and the paid-tier Stripe check. The empty
               * base URL and headers are what the app always passed
               * (same-origin, cookie session) and only matter to code paths
               * that do not run on create.
               */
              apiBaseUrl: "",
              authHeaders: () => ({}),
              // Paid member events pay out to the MEMBER's own Connect account.
              stripeStatus: () => transport.stripeStatus(),
              stripeConnectUrl: () => navigation.hrefs.connectStripe,
              searchTags: (q) => transport.searchTags(q),
              createTag: (name) => transport.createTag(name),
              navigate: (path) => nav.navigate(path),
              googleMapsApiKey,
            }}
          >
            {portal === "inline" ? (
              <PortalContainerProvider container={portalRoot}>{body}</PortalContainerProvider>
            ) : body}
          </EventManagementConfigProvider>
        </WizardNavProvider>
      </WizardCopyProvider>
      {portal === "inline" && (
        <div ref={setPortalRoot} className={themed ? "cbt-wizard-portal themed-event-form" : "cbt-wizard-portal"} />
      )}
    </div>
  );
}

function themeVars(theme: EventCreateWizardTheme | undefined): CSSProperties | undefined {
  if (!theme) return undefined;
  const v: Record<string, string> = {};
  if (theme.textColor) v["--text-color"] = theme.textColor;
  if (theme.bgColor) v["--bg-color"] = theme.bgColor;
  if (theme.brandColor) v["--brand-color"] = theme.brandColor;
  if (theme.brandContrast) v["--brand-contrast"] = theme.brandContrast;
  if (theme.primaryButtonBg) v["--primary-btn-bg"] = theme.primaryButtonBg;
  if (theme.buttonRadius) v["--button-radius"] = theme.buttonRadius;
  if (theme.cardRadius) v["--card-radius"] = theme.cardRadius;
  if (theme.headingFont) v["--heading-font"] = theme.headingFont;
  if (theme.bodyFont) v["--body-font"] = theme.bodyFont;
  return v as CSSProperties;
}

type InnerProps = Omit<EventCreateWizardProps, "initialDrafts" | "canCreateForCommunity"> & {
  isLeader: boolean;
  drafts: EventDraftSummary[];
  onLocalResume: (d: { id: string; draftStep: string | null }) => void;
};

function WizardInner({
  community, viewer, transport, navigation, extraSteps = [],
  isLeader: isLeaderHere, drafts: myDrafts, draftId, draftStepFromUrl,
  syncStepToUrl = true, onLocalResume,
}: InnerProps) {
  const { tag: communityTag, id: communityId, name: communityName, memberFeeModel, memberRequireApproval, platformFeeRate } = community;
  const hrefs = navigation.hrefs;
  const navigate = navigation.navigate ?? browserNavigate;
  const t = useWizardT("eventsUi.createEventClient");

  /*
   * Who is hosting. A leader chooses; a member has no choice to make (the
   * backend refuses community ownership for a non-leader whatever is sent).
   */
  const [ownership, setOwnership] = useState<"community" | "personal">("community");
  const effectiveOwnership: "community" | "personal" = isLeaderHere ? ownership : "personal";

  /*
   * The arrangements this member may host under. Empty is never an error: the
   * community agrees terms per request, and the step says so.
   */
  const [packages, setPackages] = useState<EventFeePackage[]>([]);
  const [packageId, setPackageId] = useState<string | null>(null);

  const [dismissedResume, setDismissedResume] = useState(false);
  const [discarded, setDiscarded] = useState<string[]>([]);
  // Skipped while resuming one: offering to reopen a draft from inside itself is a loop.
  const drafts = (draftId ? [] : myDrafts).filter((d) => !discarded.includes(d.id));
  const hasDrafts = !dismissedResume && drafts.length > 0;

  const baseSteps = resolveCreateSteps({ canChooseOwnership: isLeaderHere, ownership: effectiveOwnership, hasPackages: packages.length > 0, packageCount: packages.length, hasDrafts, withCommerceStep: true, withSettingsStep: true });

  /* ── Host-defined steps, after the last Cobuntu step and before submit ── */
  const extraIds = extraSteps.map((s) => s.id);
  const extraLabels = useMemo(() => Object.fromEntries(extraSteps.map((s) => [s.id, s.label])), [extraSteps]);
  const [extraValues, setExtraValues] = useState<Record<string, unknown>>({});
  const [extraErrors, setExtraErrors] = useState<Record<string, boolean>>({});
  const flowSteps = [...baseSteps, ...extraIds] as CreateStepId[];

  /*
   * Null means "they have not moved yet", so the opening step is DERIVED: the
   * drafts are known on the first render, so the rendered step never has to be
   * corrected after paint.
   */
  const [rawStep, setStep] = useState<CreateStepId | null>(null);
  const openingStep: CreateStepId = hasDrafts ? "resume" : (isLeaderHere ? "ownership" : "details");

  /*
   * Opening a draft gives the press an immediate answer (the row it marks is
   * the row they clicked) while the host navigates or the wizard reloads.
   */
  const [resuming, startResume] = useTransition();
  const [resumingId, setResumingId] = useState<string | null>(null);

  function resumeDraft(d: { id: string; draftStep: string | null }) {
    setResumingId(d.id);
    startResume(() => {
      if (navigation.onResumeDraft) navigation.onResumeDraft(d);
      else onLocalResume(d);
    });
  }

  /*
   * Throw a draft away: local first, then the request, and a failure puts the
   * row back. A 404 counts as gone (the transport resolves for it).
   */
  async function discardDraft(d: { id: string }) {
    setDiscarded((prev) => (prev.includes(d.id) ? prev : [...prev, d.id]));
    try {
      await transport.deleteDraft(d.id);
    } catch {
      setDiscarded((prev) => prev.filter((id) => id !== d.id));
    }
  }

  function startSomethingNew() {
    setDismissedResume(true);
    setStep(isLeaderHere ? "ownership" : "details");
  }

  // Changing ownership can delete the step the user is standing on.
  const step = clampStep(flowSteps, rawStep ?? openingStep);
  const onFinalStep = isFinalStep(flowSteps, step);
  const currentExtra = extraSteps.find((s) => s.id === step);

  /* ── Continuing a draft ── */
  const [draftRow, setDraftRow] = useState<EventDraftRow | null>(null);
  const [draftPending, setDraftPending] = useState(!!draftId);
  const draftInitial = useMemo(() => (draftRow ? eventDraftToForm(draftRow) : undefined), [draftRow]);

  // Resumed ONCE: isLeaderHere can flip after load, and re-running would undo
  // however far the person had walked since.
  const resumed = useRef(false);

  useEffect(() => {
    if (!draftId || resumed.current) return;
    resumed.current = true;
    // Re-armed: this instance may already be up from the blank flow.
    setDraftPending(true);
    let cancelled = false;
    (async () => {
      let row: EventDraftRow | null = null;
      try { row = await transport.getDraft(draftId); } catch { row = null; }
      if (cancelled) return;
      if (row) {
        setDraftRow(row);
        // Ownership first: it decides which steps exist.
        const owned = draftOwnership(row);
        if (isLeaderHere) setOwnership(owned);
        const steps = resolveCreateSteps({
          canChooseOwnership: isLeaderHere,
          ownership: isLeaderHere ? owned : "personal",
          withCommerceStep: true,
          withSettingsStep: true,
        });
        const target = resumeStep(draftStepFromUrl ?? row.draftStep ?? null, steps);
        if (target) setStep(target);
      }
      // An unreadable draft opens an empty wizard, as if none was asked for.
      setDraftPending(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, draftStepFromUrl, isLeaderHere]);

  /*
   * The step is saved AS IT MOVES, onto ?step=, so a refresh does not drop
   * someone at step one of their own draft. replaceState, not a router call:
   * a re-render would remount the form and take its in-memory files with it.
   */
  useEffect(() => {
    if (!syncStepToUrl || !draftId || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("step") === step) return;
    url.searchParams.set("step", step);
    window.history.replaceState(null, "", url.toString());
  }, [syncStepToUrl, draftId, step]);

  // Access lives on its own step; the form is told hideVisibility.
  const [viewAccess, setViewAccess] = useState<TierAccessValue>({ mode: "public", tierIds: [] });
  const [buyAccess, setBuyAccess] = useState<TierAccessValue>({ mode: "public", tierIds: [] });

  // Direction from the step INDEX, so a jump back reads as backwards.
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  function goToStep(target: CreateStepId) {
    setDirection(steps.indexOf(target) >= steps.indexOf(step) ? "forward" : "back");
    setStep(target);
  }

  const [created, setCreated] = useState<{ slug: string; name: string; outcome: CreateOutcome } | null>(null);
  // The confirmation is the last step, appended once it exists.
  const steps = created ? [...flowSteps, "done" as const] : flowSteps;
  const railCurrent = created ? ("done" as const) : step;

  // The row this wizard writes to, minted here; the endpoint upserts on it.
  const autosaveIdRef = useRef<string>(draftId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""));
  // Read at autosave time: a leader can switch ownership between two saves.
  const ownershipRef = useRef(effectiveOwnership);
  ownershipRef.current = effectiveOwnership;
  const stepRef = useRef(step);
  stepRef.current = step;
  // The autosaved row, once a save has LANDED: create finishes it.
  const savedDraftRef = useRef<string | null>(null);
  const formDataRef = useRef<EventFormData | null>(null);

  const autosave = useAutosaveDraft({
    draftId: autosaveIdRef.current,
    save: (id, snap, opts) => transport.saveDraft(id, snap, opts),
    getSnapshot: () => {
      const d = formDataRef.current;
      if (!d) return null;
      return {
        name: d.name ?? "",
        description: d.description ?? "",
        timezone: d.timezone,
        physicalLocation: d.physicalLocation,
        onlineUrl: d.onlineUrl,
        draftStep: stepRef.current,
        // A community-owned draft records the community, or its Drafts list cannot find it.
        communityId: ownershipRef.current === "community" ? communityId : null,
      };
    },
    isEnabled: () => !!formDataRef.current?.name?.trim(),
    onSaved: (id: string) => { savedDraftRef.current = id; },
  });

  // Listing REQUIRES an arrangement when there is one to pick.
  const needsPackage = packages.length > 0 && !packageId;

  // Mirrors the server exactly; permissive wherever the answer is unknown.
  const cannotTakeCommission = communityCannotTakeCommission({
    ownership: effectiveOwnership,
    payments: community.payments,
    packages,
    packageId,
  });
  const blocksListing = (a: SubmitAction) => a.requestListing && needsPackage;

  const submitActions = resolveSubmitActions({
    canSelfList: isLeaderHere,
    feeModel: memberFeeModel,
    requireApproval: memberRequireApproval,
  });
  // The footer note reads the BUTTONS, so it cannot contradict them.
  const listsImmediately = submitActions.some((a) => a.kind === "createList");

  // Categories and tiers are props of the form; empty hides / degrades.
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<EventWizardTier[]>([]);
  useEffect(() => {
    let cancelled = false;
    transport.categories().then((c) => { if (!cancelled) setCategories(Array.isArray(c) ? c : []); }).catch(() => { if (!cancelled) setCategories([]); });
    transport.tiers().then((ts) => { if (!cancelled) setMembershipTiers(Array.isArray(ts) ? ts : []); }).catch(() => { if (!cancelled) setMembershipTiers([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    /*
     * Gated on OWNERSHIP, not the role: a leader hosting personally pays the
     * same commission any member does, so they are offered the same packages
     * (the arrangement step is otherwise blank, reported from live use).
     */
    if (effectiveOwnership !== "personal") return;
    let cancelled = false;
    (async () => {
      try {
        const list = await transport.myPackages();
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setPackages(arr);
        // One arrangement is not a choice: select it.
        if (arr.length === 1) setPackageId(arr[0].id);
      } catch {
        if (!cancelled) setPackages([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag, effectiveOwnership]);

  const [showErrors, setShowErrors] = useState(false);
  const [stripeMissing, setStripeMissing] = useState(false);
  const [communityPaymentsMissing, setCommunityPaymentsMissing] = useState(false);
  // The Stripe heads-up only shows once the event goes paid.
  const [paidIntent, setPaidIntent] = useState(false);
  // T&Cs §11.4: paid listings require the MEMBER's Stripe (charges enabled).
  const [stripeReadiness, setStripeReadiness] = useState<{ loading: boolean; ready: boolean }>({ loading: true, ready: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await transport.stripeStatus();
        const ready = !!data?.connected && !!data?.chargesEnabled;
        if (!cancelled) setStripeReadiness({ loading: false, ready });
      } catch {
        if (!cancelled) setStripeReadiness({ loading: false, ready: false });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(d: EventFormData | null): string | null {
    if (!d || !d.name.trim()) return t("eventNameRequired");
    // The API rejects a name over LISTING_NAME_MAX; say so before the last step.
    if (listingNameTooLong(d.name)) return t("errNameTooLong", { max: LISTING_NAME_MAX });
    if (!d.startDate) return t("startDateRequired");
    if (!d.endDate) return t("endDateRequired");
    return null;
  }

  function validateExtra(id: string): string | null {
    const s = extraSteps.find((x) => x.id === id);
    return s?.validate ? s.validate(extraValues[id]) : null;
  }

  /**
   * The create payload from the form's state: date + time folded to ISO, tiers
   * through the package's one mapping, access from the ACCESS STEP (the form's
   * own visibility is hidden, so its values are untouched defaults).
   */
  function buildBody(d: EventFormData): Record<string, unknown> {
    const sd = new Date(d.startDate!);
    const [sh, sm] = d.startTime.split(":").map(Number);
    sd.setHours(sh, sm, 0, 0);
    const ed = new Date(d.endDate!);
    const [eh, em] = d.endTime.split(":").map(Number);
    ed.setHours(eh, em, 0, 0);

    return {
      name: d.name.trim(),
      description: d.description.trim() || undefined,
      bannerUrl: d.bannerUrl || undefined,
      startDate: sd.toISOString(),
      endDate: ed.toISOString(),
      timezone: d.timezone,
      physicalLocation: d.physicalLocation.trim() || undefined,
      // The map pin, omitted rather than null when there is none.
      physicalLatitude: d.physicalLatitude ?? undefined,
      physicalLongitude: d.physicalLongitude ?? undefined,
      onlineUrl: d.onlineUrl.trim() || undefined,
      // The full location set; when present it is the server's source of truth.
      locations: (d as EventFormData & { locations?: unknown[] }).locations,
      // A personal event sends PUBLIC: these are community-scoped and clamped server-side.
      accessibility: effectiveOwnership === "community" ? fromTierAccessValue(buyAccess).visibility : "PUBLIC",
      viewability: effectiveOwnership === "community" ? fromTierAccessValue(viewAccess).visibility : "PUBLIC",
      // Tier grants, only for a community-owned event (dropped server-side otherwise).
      ...(effectiveOwnership === "community" ? {
        viewTierIds: fromTierAccessValue(viewAccess).tierIds,
        buyTierIds: fromTierAccessValue(buyAccess).tierIds,
      } : {}),
      requiresApproval: d.requiresApproval || false,
      attendeeVisibility: d.attendeeVisibility || "PUBLIC",
      locationVisibility: (d as EventFormData & { locationVisibility?: "PUBLIC" | "ATTENDEES_ONLY" }).locationVisibility || "PUBLIC",
      // One mapping, owned by the package: a hand-rolled allowlist silently dropped fields.
      tiers: draftTiersToCreatePayload((d.tiers || []) as any),
      // undefined, not null: unset leaves the listing unfiled rather than clearing it.
      categoryId: d.categoryId || undefined,
      subCategoryId: d.subCategoryId || undefined,
      tagIds: d.tags.map((tag) => tag.id),
      communityOwnership: effectiveOwnership === "community",
      ownership: effectiveOwnership,
      communityId,
    };
  }

  // Forward moves validate; back moves never do.
  function goNext() {
    if (step === "details") {
      const v = validate(formDataRef.current);
      if (v) { setShowErrors(true); setError(v); return; }
    }
    if (currentExtra) {
      const v = validateExtra(currentExtra.id);
      if (v) { setExtraErrors((e) => ({ ...e, [currentExtra.id]: true })); setError(v); return; }
    }
    setError("");
    const target = nextStep(steps, step);
    if (target) goToStep(target);
  }

  // Returns TRUE when it consumed the press (the breadcrumb walks steps first).
  function goBack(): boolean {
    const target = previousStep(steps, step);
    if (!target) return false;
    setError("");
    goToStep(target);
    return true;
  }

  function cancel() {
    if (navigation.onCancel) navigation.onCancel();
    else navigate(hrefs.events);
  }

  /*
   * Takes the ACTION: whether it is listed and whether that lands live belong
   * to the button pressed and travel together.
   */
  async function handleSubmit(action: SubmitAction) {
    const publish = action.publish;
    const d = formDataRef.current;
    const v = validate(d);
    if (v) { setShowErrors(true); setError(v); return; }
    for (const s of extraSteps) {
      const ev = validateExtra(s.id);
      if (ev) {
        setExtraErrors((e) => ({ ...e, [s.id]: true }));
        setError(ev);
        if (step !== s.id) goToStep(s.id as CreateStepId);
        return;
      }
    }

    // §11.4: block paid submissions when the member's Stripe isn't ready.
    const hasPaidTier = !!d!.tiers?.some((tier) => (parseFloat(tier.price) || 0) > 0);
    if (hasPaidTier && !stripeReadiness.ready) { setStripeMissing(true); return; }
    // Independent: whether the COMMUNITY can be paid its commission.
    if (hasPaidTier && cannotTakeCommission) { setCommunityPaymentsMissing(true); return; }

    setCreating(true);
    setError("");
    setStripeMissing(false);

    try {
      const result = await transport.createEvent({
        ...buildBody(d!),
        publish: publish === true,
        // Finishing a draft finishes THAT row; else the autosaved one.
        ...(draftId ? { draftId } : {}),
        ...(!draftId && savedDraftRef.current ? { draftId: savedDraftRef.current } : {}),
        // Which button they pressed, for every ownership.
        requestListing: action.requestListing === true,
        // The host's opening position; omitted when they were shown no choice.
        ...(packageId ? { packageId } : {}),
      });
      if (!result.ok) {
        const msg: string = result.message || t("failedToCreateEvent");
        if (
          result.code === "STRIPE_REQUIRED" ||
          msg.toLowerCase().includes("connected stripe account") ||
          msg.toLowerCase().includes("connect your stripe account")
        ) {
          setStripeMissing(true);
        } else {
          setError(msg);
        }
        setCreating(false);
        return;
      }
      const event = result.event;
      const target = (event.slug as string | undefined) || event.id;

      // Donations sidecar: best effort, the event already exists.
      try {
        const donationPayload = d?.donation ? donationDraftToPayload(d.donation) : null;
        if (donationPayload && event?.id) {
          await transport.saveDonations(event.id, donationPayload);
        }
      } catch (e) {
        console.warn("[create event] donations save failed", e);
      }

      // The outcome is NOT the button: a member submission lands PENDING however it was sent.
      const outcome = resolveCreateOutcome({
        requestedPublish: publish === true,
        canSelfList: isLeaderHere,
        requestedListing: effectiveOwnership === "personal" ? false : undefined,
      });
      const name = (formDataRef.current?.name || "").trim();
      setCreated({ slug: target, name, outcome });
      setCreating(false);
      navigation.onDone?.({
        event: { id: event.id, slug: target, name },
        outcome,
        action: action.kind,
        ownership: effectiveOwnership,
        extraValues,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToCreateEvent"));
      setCreating(false);
    }
  }

  const header = currentExtra && !created
    ? { title: currentExtra.title, subtitle: currentExtra.subtitle ?? "" }
    : steps.length > 1
      ? { title: t(stepHeaderKeys(railCurrent).title), subtitle: t(stepHeaderKeys(railCurrent).subtitle, { community: communityName }) }
      : { title: t("hostAnEventIn", { community: communityName }), subtitle: t("createEventDescription", { community: communityName }) };

  return (
    <>
      {/* Back-nav matching the event/product detail pages. Desktop-only. No
          back action on the confirmation: walking back invites a second submit. */}
      <Breadcrumb
        onBack={created ? undefined : goBack}
        parentHref={hrefs.events}
        parentLabel={t("events")}
        currentTitle={t("newEvent")}
        maxWidthClass="max-w-2xl"
        trailing={created ? undefined : <HowItWorksButton href={hrefs.howItWorks} />}
        shouldUseHistoryBack={navigation.shouldUseHistoryBack}
      />
      <div className="mx-auto max-w-2xl px-4 pt-6 md:pt-2 pb-24 max-md:pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8">
      {/* Not drawn for a single-step flow. */}
      <CreateStepRail steps={steps} current={railCurrent} kind="event" extraLabels={extraLabels} onStepClick={created ? undefined : goToStep} />

      {!created && (
        <>

      <FirstTimeCreatorModal
        communityTag={communityTag}
        communityName={communityName}
        sellingGuideHref={hrefs.sellingGuide}
        fullGuideHref={hrefs.fullGuide}
      />

      {/* Theme adapter for the shared (hardcoded light/zinc) form, scoped to
          .themed-event-form. See theme.ts. */}
      <style>{THEME_ADAPTER_CSS}</style>

      <header className="mb-6">
        <h1 className="text-xl font-semibold">
          {header.title}
        </h1>
        <p className="text-sm opacity-60 mt-1 max-w-[58ch]">
          {header.subtitle}
        </p>
      </header>

      {/* §11.4: the member-Stripe heads-up, only once the event goes paid. */}
      {(stripeMissing || (paidIntent && !stripeReadiness.loading && !stripeReadiness.ready)) && (
        <FormNoticeBanner
          className="mb-6"
          title={t("connectStripeTitle")}
          body={t("connectStripeBody")}
          actionHref={hrefs.connectStripe}
          actionLabel={t("connectStripe")}
        />
      )}
      {/* The COMMUNITY's account. No action link ON PURPOSE: only a leader can fix it. */}
      {(communityPaymentsMissing || (paidIntent && cannotTakeCommission)) && (
        <FormNoticeBanner
          className="mb-6"
          title={t("communityPaymentsNoticeTitle", { community: communityName })}
          body={t("communityPaymentsNoticeBody", { community: communityName })}
        />
      )}

      <FormErrorBanner message={error} className="mb-6" />

      <div className="themed-event-form">
          {hasDrafts && (
            <StepPane active={step === "resume"} direction={direction}>
            <ResumeDraftStep
              drafts={drafts}
              onResume={resumeDraft}
              onDiscard={discardDraft}
              resumingId={resuming ? resumingId : null}
              communityName={communityName}
              disabled={creating}
            />
            </StepPane>
          )}

          <StepPane active={step === "ownership"} direction={direction}>
              <OwnershipToggle
                value={ownership}
                onChange={setOwnership}
                communityName={communityName}
                communityIconUrl={community.iconUrl}
                viewer={viewer}
                disabled={creating}
                platformFeeRate={platformFeeRate}
              />
            </StepPane>

          {/* Details + pricing + policies share ONE mounted EventForm; `page`
              flips the half that renders. A plain div, hidden when inactive,
              NOT a StepPane: unmounting would discard the form's own state. */}
          <div className={step === "details" || step === "commerce" || step === "settings" ? "mt-2" : "hidden"}>
            {draftPending ? (
              <p className="text-sm opacity-60">{t("draftOpening")}</p>
            ) : (
              <EventForm
                /* Re-mounted when the draft lands: the form seeds from initialData once. */
                key={draftRow?.id ?? "fresh"}
                page={step === "commerce" ? "commerce" : step === "settings" ? "settings" : "listing"}
                membershipTiers={membershipTiers}
                communityTag={communityTag}
                categories={categories}
                onChange={(data) => {
                  formDataRef.current = data;
                  // Restart the quiet period; the save fires once typing stops.
                  autosave.schedule();
                  setPaidIntent(!!data.tiers?.some((tier: { price: string }) => (parseFloat(tier.price) || 0) > 0));
                }}
                showErrors={showErrors}
                hideVisibility
                /* Per-tier member pricing only for a community-owned event. */
                showMemberPricing={effectiveOwnership === "community"}
                communityName={communityName}
                initialData={draftInitial}
              />
            )}
          </div>

      {/* The arrangement: the only part of the flow that decides what the host is PAID. */}
      <StepPane active={step === "listing"} direction={direction}>
        <div className="max-w-[560px]">
          {/* Empty is legitimate and has to SAY so: the community proposes the rate at review. */}
          {packages.length === 0 && (
            <p className="text-[13.5px] leading-relaxed opacity-65">
              {t("noPackagesNote", { community: communityName })}
            </p>
          )}
          {packages.length > 0 && (
            <div>
              <PackagePicker
                packages={packages}
                value={packageId}
                onChange={setPackageId}
                communityName={communityName}
                platformFee={{ rate: 4, fixedCents: 30, processing: { rate: 1.5, fixedCents: 25 } }}
              />
            </div>
          )}
        </div>
      </StepPane>

          <StepPane active={step === "access"} direction={direction}>
            <ListingAccessStep
              kind="event"
              viewAccess={viewAccess}
              buyAccess={buyAccess}
              onChange={({ viewAccess: v, buyAccess: b }) => { setViewAccess(v); setBuyAccess(b); }}
              tiers={membershipTiers}
              communityName={communityName}
              disabled={creating}
            />
            </StepPane>

          {/* Host-defined steps. Mounted throughout, like the others, so an
              answer survives walking back and forth. */}
          {extraSteps.map((s) => (
            <StepPane key={s.id} active={step === s.id} direction={direction}>
              {s.render({
                value: extraValues[s.id],
                onChange: (next) => setExtraValues((prev) => ({ ...prev, [s.id]: next })),
                showErrors: !!extraErrors[s.id],
                disabled: creating,
              })}
            </StepPane>
          ))}
      </div>

      {/* Desktop footer: note + right-aligned actions, pinned to the bottom. */}
      <div className="csb-scroll-shell hidden md:block fixed bottom-0 right-0 left-0 md:left-[var(--app-sidebar-w,0px)] z-40 border-t border-current/10" style={{ background: "color-mix(in srgb, var(--bg-color) 92%, transparent)", backdropFilter: "blur(10px)" }}>
        <div className="mx-auto flex max-w-[var(--container-max-width,80rem)] items-center justify-between gap-4 px-8 py-3">
          {/* `min-w-0`: the prose yields when the bar runs out of room. */}
          <p className="min-w-0 text-[12.5px] opacity-60">
            {needsPackage && step === "listing"
              ? t("notePickArrangement")
              : step === "resume"
              ? t("noteDrafts")
              : listsImmediately ? t("noteListsNow", { community: communityName }) : t("noteReviewed")}
          </p>
          <div className="flex shrink-0 items-center gap-2.5">
            {previousStep(steps, step) ? (
              <WizardButton onClick={goBack} disabled={creating}>Back</WizardButton>
            ) : (
              /* Step one has no Back, so it gets a way out. */
              <WizardButton onClick={cancel} disabled={creating}>Cancel</WizardButton>
            )}
            {step === "resume" && (
              <WizardButton primary onClick={startSomethingNew} disabled={creating}>
                {t("draftStartNewEvent")}
              </WizardButton>
            )}
            {!onFinalStep && step !== "resume" && (
              <WizardButton primary onClick={goNext} disabled={creating}>Next</WizardButton>
            )}
            {onFinalStep && submitActions.map((a) => (
              <WizardButton
                key={a.kind}
                primary={a.primary}
                onClick={() => handleSubmit(a)}
                disabled={creating || blocksListing(a)}
              >
                {creating ? t("creating") : t(a.kind)}
              </WizardButton>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile sticky bar: one row, same order, equal shares. */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-current/10 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ background: "color-mix(in srgb, var(--bg-color) 92%, transparent)", backdropFilter: "blur(10px)" }}
      >
        <div className="flex items-stretch gap-2">
          <div className="flex-1 min-w-0">
            {previousStep(steps, step) ? (
              <WizardButton onClick={goBack} disabled={creating}>Back</WizardButton>
            ) : (
              <WizardButton onClick={cancel} disabled={creating}>Cancel</WizardButton>
            )}
          </div>
          {step === "resume" && (
            <div className="flex-1 min-w-0">
              <WizardButton primary onClick={startSomethingNew} disabled={creating}>
                {t("draftStartNewEvent")}
              </WizardButton>
            </div>
          )}
          {!onFinalStep && step !== "resume" && (
            <div className="flex-1 min-w-0">
              <WizardButton primary onClick={goNext} disabled={creating}>Next</WizardButton>
            </div>
          )}
          {onFinalStep && submitActions.map((a) => (
            <div key={a.kind} className="flex-1 min-w-0">
              <WizardButton
                primary={a.primary}
                onClick={() => handleSubmit(a)}
                disabled={creating || blocksListing(a)}
              >
                {creating ? t("creating") : t(a.kind)}
              </WizardButton>
            </div>
          ))}
        </div>
      </div>

        </>
      )}

      {created && (
        <CreatedModal
          open
          kind="event"
          outcome={created.outcome}
          name={created.name}
          viewHref={hrefs.viewEvent(created.slug)}
          manageHref={hrefs.manageEvent(created.slug)}
          /* The listing review thread, where the request is tracked and its terms negotiated. */
          reviewHref={hrefs.reviewListing(created.slug)}
          createAnotherHref={hrefs.createAnother}
          onNavigate={navigate}
        />
      )}
      </div>
    </>
  );
}
