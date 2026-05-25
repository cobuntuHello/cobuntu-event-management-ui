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

// Unified Attendees + Sales section — the surface a host sees when
// managing their event. Combines approved/pending/rejected attendees,
// invitations, paid-event KPI cards, and the per-attendee refund
// modal (Phase H of host-refunds-and-sales-visibility).
export { AttendeesAndInvitationsSection } from "./components/AttendeesAndInvitationsSection";
export { AttendeeDetailDrawer } from "./components/AttendeesAndInvitationsSection/AttendeeDetailDrawer";
export { UserAvatarFallback } from "./ui/user-avatar-fallback";

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
export { DuplicateModal, type DuplicateModalProps } from "./components/DuplicateModal";

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
