// @cobuntu/event-management-ui — public exports
//
// Add a component here when porting it from the consuming apps. Both apps
// then import from the package root.

// Config — every consumer must wrap its event-management surface with the
// provider so the components can fetch from the right API and authenticate.
export {
  EventManagementConfigProvider,
  useEventManagementConfig,
  useJsonHeaders,
  useUpdateEvent,
  type EventManagementConfig,
} from "./config";

// Components
export { PriceEditModal, type PriceEditModalProps } from "./components/PriceEditModal";
export {
  SchedulingSection,
  deriveScheduleState,
  type SchedulingSectionProps,
  type TierScheduleState,
} from "./components/SchedulingSection";

// Unified Attendees + Sales section — the surface a host sees when
// managing their event. Combines approved/pending/rejected attendees,
// invitations, paid-event KPI cards, and the per-attendee refund
// modal (Phase H of host-refunds-and-sales-visibility).
export { AttendeesAndInvitationsSection } from "./components/AttendeesAndInvitationsSection";
export { AttendeeDetailDrawer } from "./components/AttendeesAndInvitationsSection/AttendeeDetailDrawer";
// Extracted KPI tiles (feat/manage-event-restructure / attendees-unified).
// Mount independently on the Overview tab while the rest of the attendees
// section moves to its own Attendees tab in the consumer apps.
export { EventRevenueKPIs } from "./components/EventRevenueKPIs";
export { UserAvatarFallback } from "./ui/user-avatar-fallback";

// Per-event listings panel — renders one row per community in
// event_communities with inline Show / Hide / Remove / Withdraw
// controls. Used inline on the Overview tab (admin) and /manage
// (community-app) via AttendeesAndInvitationsSection.belowRevenueSlot.
export {
  EventListingsSection,
  type EventListingsSectionProps,
  type AvailableCommunity,
} from "./components/EventListingsSection";

// Draft-mode helpers — for consumers (e.g. admin's create-event form)
// rendering PriceEditModal in draftMode where the parent owns state.
export type {
  DraftTier,
  DonationDraft,
} from "./components/PriceEditModal/types";
export {
  blankTier,
  blankDonation,
  buildTierBody,
  buildDonationBody,
} from "./components/PriceEditModal/helpers";
export { EditEventDrawer } from "./components/EditEventDrawer";
export { NameEditModal } from "./components/NameEditModal";
export { DateTimeEditModal } from "./components/DateTimeEditModal";
export { LocationEditModal } from "./components/LocationEditModal";
export { SlugEditModal, type SlugEditModalProps } from "./components/SlugEditModal";
export { DistributionEditModal, type DistributionEditModalProps } from "./components/DistributionEditModal";
export { ShareModal } from "./components/ShareModal";
export { PublishModal } from "./components/PublishModal";
export { DeleteModal } from "./components/DeleteModal";

// Membership funnel — host config UI for the event-as-membership-funnel feature.
// Renders below AttendeesAndInvitationsSection in the event overview. Either
// a three-radio config (None / EMBED / APPLY_LINK), or a blocked-state
// explainer with an "Open event settings" button when event prerequisites
// don't fit. Plan: cobuntu-backend-monorepo/docs/features/event-membership-funnel.md
export {
  MembershipFunnelSection,
  type MembershipFunnelSectionProps,
  type MembershipFunnelSectionEvent,
  type MembershipFunnelSectionCommunity,
} from "./components/MembershipFunnelSection";
export { DuplicateModal, type DuplicateModalProps } from "./components/DuplicateModal";

// Promote-attendee-to-host — feat/manage-event-restructure sub-feature.
// Lets the event creator turn a paid attendee into a host without
// adding a fresh, payment-bypassing host row. Mount alongside (not
// instead of) the legacy AddHostModal; that path stays for hosts who
// shouldn't pay (staff/founders/etc.).
export { PromoteAttendeeModal, type PromoteAttendeeModalProps } from "./components/PromoteAttendeeModal";

// attendees-action/ — shared primitives that build the new generation
// of event-host action modals (Add / Invite / Promote and any future
// surfaces). Live in the shared pkg so admin + community-app stay
// aligned without re-duplicating the same picker / chip / shell code
// in two repos. See cobuntu-admin's earlier "attendees-action redesign"
// PR for the original implementation; this module is the canonical
// home going forward.
export { AttendeesActionModalShell } from "./components/attendees-action/AttendeesActionModalShell";
export {
    RecipientChip,
    InlinePersonalizeEditor,
    recipientKey,
    isValidEmail,
    type Recipient,
} from "./components/attendees-action/RecipientChip";
export {
    SmartRecipientInput,
    type Member as SmartRecipientInputMember,
} from "./components/attendees-action/SmartRecipientInput";
export { PrefillSuggestionsRow } from "./components/attendees-action/PrefillSuggestionsRow";
export { PostSendCelebration } from "./components/attendees-action/PostSendCelebration";

// Re-export the Stripe primitives in case a consumer wants to render the
// status anywhere else (e.g. the Overview tab's "Connect Stripe" hint).
export { useStripeStatus, StripeRequiredWarning, type StripeStatus } from "./components/stripe-status";

// UI primitives — building blocks shared by the event-management components.
// Re-exported here so consuming apps can either import them directly (handy
// for the community-app, which has no shadcn primitives of its own) or
// continue using their own copies (admin already has its own equivalents).
export { Button, buttonVariants, type ButtonProps } from "./ui/button";
export { Input, type InputProps } from "./ui/input";
export { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
export { Calendar, type CalendarProps } from "./ui/calendar";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem } from "./ui/select";
export { ModalShell } from "./ui/modal-shell";
export { cn } from "./ui/utils";

// New shared primitives — exposed for consumers building the redesigned
// PriceEditModal (Phase A1 of the price-modal-redesign feature). The
// existing `ModalShell` above stays put as a thin wrapper around the
// shared shell so call-sites that bring their own close affordance keep
// working unchanged. Components adopting the wizard/hub layout should
// import these directly from "@cobuntu/management-ui-shared" — they're
// re-exported here only for surface symmetry with the existing UI block.
export {
  ModalShell as SharedModalShell,
  TextField,
  NumberField,
  SectionCard,
  WizardProgress,
  DiscardPrompt,
  BillingRadio,
  DiscountModeRadio,
  type ModalShellProps as SharedModalShellProps,
  type TextFieldProps,
  type NumberFieldProps,
  type SectionCardProps,
  type WizardProgressProps,
  type WizardStep,
  type DiscardPromptProps,
  type BillingRadioProps,
  type BillingMode,
  type BillingOption,
  type DiscountModeRadioProps,
  type DiscountMode,
  type DiscountOption,
} from "@cobuntu/management-ui-shared";

// Event-domain primitives — used by EditEventDrawer (coming in PR 5). Each
// one was previously local to cobuntu-admin; community-app didn't have
// equivalents. Now both apps consume them from here.
export { EventTimestamps } from "./ui/event-timestamps";
export { EventTags } from "./ui/event-tags";
export { RichTextEditor } from "./ui/rich-text-editor";
export { EventLocationSelector } from "./ui/event-location-selector";

// Google Maps helpers (used by EventLocationSelector). Consumers can import
// `isValidUrl` / `isVideoConferencingUrl` directly if they need to validate
// URLs in form code outside the picker.
export {
  searchLocations,
  getLocationDetails,
  isValidUrl,
  isVideoConferencingUrl,
  isGoogleMapsConfigured,
  type LocationSuggestion,
  type LocationDetails,
} from "./lib/google-maps";

// feat/manage-event-restructure umbrella — settings-drawer sub-PR (v0.2.11).
// New Settings drawer + extracted standalone modals so each setting can
// either live inside the drawer (Viewability / Access / Distribution / Funnel)
// or as a quick-edit card on the EventCard (Description / Tags). The legacy
// EditEventDrawer stays exported (deprecated, will be removed in a later
// sub-PR under the same umbrella once both consumers have migrated).
export { SettingsDrawer } from "./components/SettingsDrawer";
export { ViewabilityEditModal } from "./components/ViewabilityEditModal";
export { AccessibilityEditModal } from "./components/AccessibilityEditModal";
export { DescriptionEditModal } from "./components/DescriptionEditModal";
export { TagsEditModal } from "./components/TagsEditModal";
export { MembershipFunnelEditModal } from "./components/MembershipFunnelEditModal";
