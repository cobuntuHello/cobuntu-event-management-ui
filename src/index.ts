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

// Activity tab — reverse-chronological feed of every host-visible
// action on the event. Powers the new Activity tab in admin +
// community-app's event manage page. Fetches from the shared BE
// endpoint shipped alongside (services/core
// GET /api/communities/:tag/events/:eventId/activity). Plan doc:
// cobuntu-backend-monorepo/docs/features/event-activity-log.md.
export { EventActivityTab, type EventActivityTabProps } from "./components/activity/EventActivityTab";
export {
  renderActivitySentence,
  formatRelativeTime,
  type ActivityEntryForRender,
  type RenderedSentence,
} from "./components/activity/activitySentences";

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
  draftTiersToCreatePayload,
  buildDonationBody,
} from "./components/PriceEditModal/helpers";
export { EditEventDrawer } from "./components/EditEventDrawer";
export { NameEditModal } from "./components/NameEditModal";
export { DateTimeEditModal } from "./components/DateTimeEditModal";
export { LocationEditModal } from "./components/LocationEditModal";
export { SlugEditModal, type SlugEditModalProps } from "./components/SlugEditModal";
export { DistributionEditModal, type DistributionEditModalProps } from "./components/DistributionEditModal";
export { AfterCheckoutEditModal, type AfterCheckoutEditModalProps } from "./components/AfterCheckoutEditModal";
export { ShareModal } from "./components/ShareModal";
export { PublishModal } from "./components/PublishModal";
export { DeleteModal } from "./components/DeleteModal";

// (MembershipFunnelSection + MembershipFunnelEditModal removed alongside the
// BE module kill in cobuntu-backend-monorepo PR #671. The event-membership-
// funnel feature will be rebuilt as pure-FE later — Workstream 1 in the
// events-domain roadmap.)
export { DuplicateModal, type DuplicateModalProps } from "./components/DuplicateModal";

// Event group chat (event<->chat linking). Host-only "Create Group Chat" modal
// + the overview capacity notices. Backend: docs/features/event-group-chat.md.
export { CreateGroupChatModal, type CreateGroupChatModalProps } from "./components/CreateGroupChatModal";
export { EventChatCapacityNotice, type EventChatCapacityNoticeProps } from "./components/EventChatCapacityNotice";

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

// hosts/ — the v2 host-management surface. Single shared component
// owns the hosts list + the two add-paths (Add community member / Promote
// attendee) so admin and community-app render the same UX. Backed by
// the host-auth v2 BE (any-host or EVENTS_MANAGE_LISTINGS can add/remove;
// creator-immutability on user-owned events; event_host_audits log).
// See cobuntu-backend-monorepo docs/features/event-hosts-v2.md.
export { HostsManagementSection, type HostsManagementSectionProps, type PromoteEligibleAttendee } from "./components/hosts/HostsManagementSection";
export { HostChip, type Host } from "./components/hosts/HostChip";
export { AddMemberAsHostModal, type AddMemberAsHostModalProps } from "./components/hosts/AddMemberAsHostModal";
export { ConfirmRemoveHostModal, type ConfirmRemoveHostModalProps } from "./components/hosts/ConfirmRemoveHostModal";

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

// Create-event form — the full "new event" form (image, name, schedule,
// location/description/tags, ticket tiers, visibility/attendance/approval).
// Moved out of cobuntu-admin so both the admin (community-leader-facing) and
// the community app (member "host an event") render the EXACT same form and
// can never drift again. The consumer wraps it in
// <EventManagementConfigProvider> (Stripe status + tier modal read
// apiBaseUrl/authHeaders/stripeConnectUrl from it) and owns the submit —
// see each app's create-event page for the payload builder.
export { EventForm, type EventFormData, type TierItem } from "./components/EventForm";

// UI primitives the EventForm composes. Exported so consumers — especially
// the community-app, which has no shadcn primitives of its own — can reuse
// them directly (and so the banner cropper is available for other surfaces).
export { Switch } from "./ui/switch";
export { Slider } from "./ui/slider";
export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "./ui/dialog";
export { BannerCropModal, type BannerCropResult } from "./ui/banner-crop-modal";
export { StockPhotoPicker } from "./ui/stock-photo-picker";

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
// either live inside the drawer (Viewability / Access / Distribution /
// Refund policy) or as a quick-edit card on the EventCard (Description /
// Tags). The legacy EditEventDrawer stays exported (deprecated, will be
// removed in a later sub-PR under the same umbrella once both consumers
// have migrated).
export { SettingsDrawer } from "./components/SettingsDrawer";
export { ViewabilityEditModal } from "./components/ViewabilityEditModal";
export { RefundPolicyEditModal, refundPolicySummary } from "./components/RefundPolicyEditModal";
export { AccessibilityEditModal } from "./components/AccessibilityEditModal";
export { DescriptionEditModal } from "./components/DescriptionEditModal";
export { TagsEditModal } from "./components/TagsEditModal";
// (MembershipFunnelEditModal removed alongside the BE module kill.)

// Category picker — the consumer loads the options and passes them to
// EventForm; the type is exported so it can shape that fetch.
export { CategoryPickerRow, type CategoryOption } from "./components/CategoryPickerRow";

/**
 * The event manage PAGE — tabs, views, edit rows. Both apps mount this rather
 * than composing their own from the pieces above, which is how the two drifted
 * in the first place.
 */
export { EventManagePage, visibleViews, type EventManagePageProps, type ViewKey } from "./page/EventManagePage";
/*
 * The tab keys, exported so a host does not keep its OWN list.
 *
 * The admin app had one -- a hand-written VIEW_KEYS guarding ?view= -- and it
 * was missing "details" and "ledger". Both tabs rendered, both wrote the URL on
 * click, and the page then rejected the value it had just written and fell back
 * to Overview. From the outside: "I click the tab and nothing happens."
 *
 * That was the THIRD copy of this list, after SECTIONS and visibleViews. A key
 * added to the package now reaches the host without anyone remembering to.
 */
export { SECTION_KEYS } from "./page/sections/SectionsNav";
export { getEventManagementConfig } from "./config";
export { EventManageHeader, type EventManageHeaderProps } from "./page/EventManageHeader";

/**
 * Agenda item duration.
 *
 * Exported because the member-facing event page in the community app has to
 * show the same pill as the manage view here, and "end minus start" computed
 * twice is how two screens end up disagreeing about the same item.
 */
export {
  agendaDurationMinutes,
  splitDuration,
  formatDurationShort,
} from "./shared/agendaDuration";
