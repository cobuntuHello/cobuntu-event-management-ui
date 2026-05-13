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
  type EventManagementConfig,
} from "./config";

// Components
export { PriceEditModal, type PriceEditModalProps } from "./components/PriceEditModal";
export { EditEventDrawer } from "./components/EditEventDrawer";

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
