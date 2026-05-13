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

// Re-export the Stripe primitives in case a consumer wants to render the
// status anywhere else (e.g. the Overview tab's "Connect Stripe" hint).
export { useStripeStatus, StripeRequiredWarning, type StripeStatus } from "./components/stripe-status";
