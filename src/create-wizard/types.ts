import type * as React from "react";
import type { CreateOutcome, MemberFeeModel, SubmitAction } from "@cobuntu/management-ui-shared";
import type { CategoryOption } from "../components/CategoryPickerRow";
import type { EventCreateWizardCopy } from "./i18n";

/**
 * EventCreateWizard's contract with its host.
 *
 * The wizard owns the flow (steps, validation, the create body, drafts, gates)
 * and the markup. The host owns everything the wizard must not know about:
 * where the API is and how it authenticates (`transport`), where links go and
 * how to follow them (`navigation`), and what the words are (`copy`).
 *
 * The community app passes its same-origin /api/* calls and Next router;
 * Cobuntu Embed passes its public v1 calls and the site's own routes.
 */

/** An unfinished wizard, as the "Continue where you left off" step lists it. */
export interface EventDraftSummary {
  id: string;
  kind: "event";
  name: string | null;
  /** Where they stopped. Null for drafts written before the pointer existed. */
  draftStep: string | null;
  /** ISO timestamp. */
  updatedAt: string;
  /** Set when the draft is being built for the community rather than the person. */
  communityId: string | null;
}

/** A stored draft row. Everything is optional by design: resume fails soft. */
export interface EventDraftRow {
  id?: string;
  communityId?: string | null;
  draftStep?: string | null;
  [key: string]: unknown;
}

/** What autosave writes: the fields worth keeping between keystrokes. */
export type EventDraftSnapshot = Record<string, unknown>;

/** A fee package (arrangement) the member may host under. `rate` is 0..1. */
export interface EventFeePackage {
  id: string;
  name: string;
  description: string | null;
  rate: number;
}

export interface MemberStripeStatus {
  connected: boolean;
  chargesEnabled: boolean;
}

export interface EventWizardPermissions {
  /** EVENTS_CREATE in this community: may create on the community's behalf. */
  eventsCreate: boolean;
}

export interface EventWizardTier {
  id: string;
  name: string;
}

export interface EventWizardTag {
  id: string;
  name: string;
  searchName?: string;
}

/** The answer to a draft save. A 409 means the row is no longer a draft. */
export type SaveDraftResult = { ok: true } | { ok: false; status: number };

/** The create call's answer. */
export type CreateEventResult =
  | { ok: true; event: { id: string; slug?: string | null; [key: string]: unknown } }
  | {
      ok: false;
      status?: number;
      /** Machine code from the API, e.g. "STRIPE_REQUIRED". */
      code?: string;
      /** Human message from the API (`error` or `message`). */
      message?: string;
    };

/**
 * Every network call the wizard makes, as async functions.
 *
 * Each maps 1:1 onto an existing endpoint (see the plan doc's table). The
 * functions are bound to the community and the signed-in member by the host;
 * none of them takes a community tag.
 */
export interface EventCreateWizardTransport {
  /** The member's unfinished event drafts in this community. */
  listDrafts(): Promise<EventDraftSummary[]>;
  /** One draft, or null when it cannot be read (the wizard then opens empty). */
  getDraft(id: string): Promise<EventDraftRow | null>;
  /**
   * Upsert the draft row `id` (the wizard mints it; it is the idempotency key).
   * `keepalive` is set for the flush on page hide.
   */
  saveDraft(id: string, snapshot: EventDraftSnapshot, opts?: { keepalive?: boolean }): Promise<SaveDraftResult>;
  /** Delete a draft. Resolve when deleted or already gone (404); throw otherwise. */
  deleteDraft(id: string): Promise<void>;
  /** Fee packages for a personal listing (productType EVENT). Empty when none. */
  myPackages(): Promise<EventFeePackage[]>;
  /** The member's OWN Stripe (paid events pay out to the member). */
  stripeStatus(): Promise<MemberStripeStatus>;
  /** Only called when the host does not pass `canCreateForCommunity`. */
  permissions(): Promise<EventWizardPermissions>;
  /** Event categories of this community. Empty hides the picker. */
  categories(): Promise<CategoryOption[]>;
  /** Membership tiers (segments/public), for the access step and member pricing. */
  tiers(): Promise<EventWizardTier[]>;
  searchTags(query: string): Promise<EventWizardTag[]>;
  createTag(name: string): Promise<EventWizardTag>;
  /** POST the create body (see buildCreateEventBody) and report the result. */
  createEvent(body: Record<string, unknown>): Promise<CreateEventResult>;
  /** PUT donation settings on the new event. Best effort: a throw only warns. */
  saveDonations(eventId: string, payload: Record<string, unknown>): Promise<void>;
}

/** Props a host's link component receives (see `navigation.renderLink`). */
export interface WizardLinkProps {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  "aria-label"?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export interface EventCreateWizardHrefs {
  /** The events list: breadcrumb parent and the default Cancel target. */
  events: string;
  /** Where a member connects their own Stripe. */
  connectStripe: string;
  /** "How it works" (selling in this community). */
  howItWorks: string;
  /** The selling guide linked from the first-time explainer. */
  sellingGuide: string;
  /** "Read the full guide" in the first-time explainer. */
  fullGuide: string;
  /** A fresh create flow ("Create another event"). */
  createAnother: string;
  viewEvent: (slugOrId: string) => string;
  manageEvent: (slugOrId: string) => string;
  /** The listing review thread for a pending listing. */
  reviewListing: (slugOrId: string) => string;
}

/** What onDone receives once the event exists. */
export interface EventCreateWizardResult {
  event: { id: string; slug: string; name: string };
  /** What happened to the listing: published, pending, unlisted, saved. */
  outcome: CreateOutcome;
  /** The button pressed. */
  action: SubmitAction["kind"];
  ownership: "community" | "personal";
  /** Answers to `extraSteps`, keyed by step id. Never sent to Cobuntu. */
  extraValues: Record<string, unknown>;
}

export interface EventCreateWizardNavigation {
  hrefs: EventCreateWizardHrefs;
  /** Follow an href (the host router). Default: window.location.assign. */
  navigate?: (href: string) => void;
  /** Render a link (e.g. next/link). Default: a plain <a>. */
  renderLink?: (props: WizardLinkProps) => React.ReactNode;
  /** Cancel on the first step. Default: navigate(hrefs.events). */
  onCancel?: () => void;
  /** Called once the event is created, before the confirmation step shows. */
  onDone?: (result: EventCreateWizardResult) => void;
  /**
   * Open a draft from the Continue step. The app navigates to its own
   * `?draft=` URL; omitted, the wizard resumes it in place.
   */
  onResumeDraft?: (draft: { id: string; draftStep: string | null }) => void;
  /**
   * Whether the breadcrumb's back arrow should pop browser history rather than
   * follow its href (the app: when there is in-app history to go back to).
   * Default: never.
   */
  shouldUseHistoryBack?: () => boolean;
}

/** A host-defined step appended after the last Cobuntu step, before submit. */
export interface EventCreateWizardExtraStep<V = unknown> {
  /** Unique, and not one of the built-in step ids. */
  id: string;
  /** The name on the progress rail. */
  label: string;
  /** Page heading on this step. */
  title: string;
  subtitle?: string;
  render: (ctx: {
    value: V | undefined;
    onChange: (next: V) => void;
    /** True once the person tried to leave the step with it invalid. */
    showErrors: boolean;
    disabled: boolean;
  }) => React.ReactNode;
  /** Return an error message to block Next / submit, or null when valid. */
  validate?: (value: V | undefined) => string | null;
}

/**
 * Branding for a host that is not the community app. Each value becomes the
 * CSS variable the wizard already reads; anything omitted is inherited.
 * Setting a theme also brands the portalled modals (they mount inside the
 * wizard's themed wrapper instead of on document.body).
 */
export interface EventCreateWizardTheme {
  textColor?: string;
  bgColor?: string;
  brandColor?: string;
  /** Text on brand-coloured fills. */
  brandContrast?: string;
  primaryButtonBg?: string;
  buttonRadius?: string;
  cardRadius?: string;
  headingFont?: string;
  bodyFont?: string;
}

export interface EventCreateWizardCommunity {
  tag: string;
  id: string;
  name: string;
  iconUrl?: string | null;
  /** The community's payments capability; undefined when unknown (permissive). */
  payments?: { connected: boolean; chargesEnabled: boolean };
  /** What Cobuntu charges this community for events (0..1). */
  platformFeeRate?: number;
  /** The member-event fee model; null when member listing is off. */
  memberFeeModel: MemberFeeModel | null;
  /** Whether member event submissions are reviewed before going live. */
  memberRequireApproval: boolean;
}

export interface EventCreateWizardProps {
  community: EventCreateWizardCommunity;
  /** The signed-in member, for the ownership card's avatar. */
  viewer?: { name?: string | null; profileImage?: string | null };
  transport: EventCreateWizardTransport;
  navigation: EventCreateWizardNavigation;
  copy?: EventCreateWizardCopy;
  extraSteps?: EventCreateWizardExtraStep<any>[];
  /**
   * Where `extraSteps` go: right after this built-in step id (e.g. "details").
   * Omitted, or an id not in this flow, they stay after the last Cobuntu step,
   * as before. Opt-in, so no other host changes.
   */
  extraStepsAfter?: string;
  theme?: EventCreateWizardTheme;
  /**
   * Where portalled layers mount. "inline" (default) mounts them inside the
   * wizard root, so the scoped prebuilt stylesheet and a theme reach them;
   * "body" keeps document.body (the community app, whose modals stay light).
   */
  portal?: "inline" | "body";
  googleMapsApiKey?: string;
  /**
   * EVENTS_CREATE, when the host already knows it (the app reads it from its
   * membership context). Omitted, the wizard asks transport.permissions().
   */
  canCreateForCommunity?: boolean;
  /**
   * Unfinished drafts, when the host resolved them before render (the app does,
   * on the server, so the opening step is right on first paint). Omitted, the
   * wizard asks transport.listDrafts() and waits for the answer.
   */
  initialDrafts?: EventDraftSummary[];
  /** The draft being continued (the app's ?draft=). */
  draftId?: string | null;
  /** Where they were when they last moved (the app's ?step=). */
  draftStepFromUrl?: string | null;
  /** Mirror the step onto ?step= while continuing a draft. Default true. */
  syncStepToUrl?: boolean;
}
