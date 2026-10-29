/**
 * English copy for EventCreateWizard, the default when a host passes no `t`.
 *
 * GENERATED from cobuntu-community-app messages/en.json (the namespaces the
 * wizard reads: eventsUi.createEventClient, eventsUi.ownership,
 * marketplaceUi.firstTimeCreatorModal, shared.howItWorksButton) so the package
 * and the app say the same thing. The app keeps passing its next-intl `t`, which
 * resolves the same keys in every locale; this is for hosts without one.
 *
 * Keys are looked up fully qualified, e.g. "eventsUi.createEventClient.events".
 * Messages are ICU (plural, select) with <b>/<link> rich tags.
 */
export const EVENT_WIZARD_MESSAGES_EN = {
  "eventsUi": {
    "createEventClient": {
      "eventNameRequired": "Event name is required",
      "startDateRequired": "Start date is required",
      "endDateRequired": "End date is required",
      "notAuthenticated": "Not authenticated",
      "failedToCreateEvent": "Failed to create event",
      "events": "Events",
      "newEvent": "New event",
      "hostAnEventIn": "Host an event in {community}",
      "createEventDescription": "Create an event. It will appear on {community}'s events page once approved (or immediately, if approval isn't required).",
      "connectStripeTitle": "Connect Stripe to sell tickets",
      "connectStripeBody": "Paid ticket tiers need a connected Stripe Connect account with charges enabled. You can still create a free event.",
      "connectStripe": "Connect Stripe",
      "donationsNotSavedTitle": "Donations were not saved",
      "donationsNotSavedBody": "Your event was created, but the donation settings could not be saved because there's no connected Stripe account to receive them yet. Connect one, then set donations up again from the event's pricing settings.",
      "creating": "Creating…",
      "submitForReview": "Submit for review",
      "submit": "Submit",
      "save": "Save",
      "saveRequest": "Save & Request Listing",
      "create": "Create",
      "createRequest": "Create & Request Listing",
      "stepOwnershipTitle": "Who is hosting this?",
      "stepOwnershipSubtitle": "Both go live straight away. What changes is where the money lands, who takes a cut, and which options you get.",
      "stepDetailsTitle": "About your event",
      "stepDetailsSubtitle": "When it happens, where it is, and how you describe it.",
      "stepCommerceTitle": "Pricing",
      "stepCommerceSubtitle": "Set your ticket tiers.",
      "stepSettingsTitle": "Policies & access",
      "stepSettingsSubtitle": "The optional extras: whether you approve people before they register.",
      "stepAccessTitle": "Who is this for?",
      "stepAccessSubtitle": "Choose who in {community} can find this event, and who can register.",
      "packageHeading": "How this gets hosted",
      "packageSingle": "{community} lists member events on these terms.",
      "packageChoose": "Pick how you'd like {community} to handle it. They review your request before it goes live.",
      "stepListingTitle": "Your arrangement",
      "stepListingSubtitle": "The terms you host under in {community}.",
      "stepDoneTitle": "All set",
      "stepDoneSubtitle": "Your event is created. Choose what to do next.",
      "draftOpening": "Opening your draft...",
      "errDraftNeedsName": "Give it a name first, so you can find it again.",
      "createList": "Create & List",
      "noteReviewed": "Free to host · Create keeps it to yourself; leaders review a listing before it goes live.",
      "noteListsNow": "Free to host · Create keeps it to yourself; Create & List puts it in {community} right away.",
      "draftJustNow": "just now",
      "draftMinutesAgo": "{count, plural, one {# minute ago} other {# minutes ago}}",
      "draftHoursAgo": "{count, plural, one {# hour ago} other {# hours ago}}",
      "draftDaysAgo": "{count, plural, one {# day ago} other {# days ago}}",
      "draftStartNew": "Start something new",
      "stepResumeTitle": "Continue where you left off",
      "stepResumeSubtitle": "You have unfinished events. Pick one up, or start something new.",
      "draftLeftOn": "Left on {step}",
      "noteDrafts": "Drafts are private. They stay here until you finish them.",
      "noPackagesNote": "{community} has not published terms for your tier, so there is nothing to pick. Your request goes in without one and they will propose the commission when they review it.",
      "notePickArrangement": "Pick an arrangement above to list it, or Create keeps it to yourself.",
      "draftDiscard": "Discard this draft",
      "draftDiscardConfirm": "Discard",
      "draftDiscardCancel": "Keep",
      "draftStartNewEvent": "Create New Event",
      "draftDiscardBody": "“{name}” will be permanently deleted. This can’t be undone.",
      "draftDiscardClose": "Close",
      "communityPaymentsNoticeTitle": "{community} cannot receive payments yet",
      "communityPaymentsNoticeBody": "This community takes a commission on paid events, but has not connected a payment account to receive it, so a paid event cannot be listed here yet. Ask a community leader to connect one. You can still create a free event.",
      "errNameTooLong": "A name is a title, not a description. Keep it to {max} characters or fewer."
    },
    "ownership": {
      "legend": "Who is hosting this?",
      "communityLabel": "{community}",
      "communityHint": "The community hosts it. Payouts go to the community, and it goes live without review.",
      "personalLabel": "You",
      "personalHint": "You host it. Payouts go to your own Stripe, and the community's seller commission applies.",
      "communitySub": "The community hosts it",
      "personalSub": "You host it, in this community",
      "communityPayout": "Payouts to <b>the community's Stripe</b>",
      "personalPayout": "Payouts to <b>your own Stripe</b>",
      "communityCommission": "No commission",
      "personalCommission": "The community's <b>commission applies</b>",
      "capVisibility": "Choose who can see it",
      "capTierPricing": "Price per tier",
      "exampleTitle": "Selling a €10 ticket yourself",
      "exampleBody": "If the community's commission is 10%, it takes €1. You keep €9, less Stripe's card fees.",
      "exampleFootnote": "Neither is cheaper in every case — it depends on your community's commission rate versus its Cobuntu rate. Ask a leader if you are not sure.",
      "sameEitherWay": "The same either way: pricing tiers, pay-what-you-want and instalments — and require approval to register, where you are the one who approves on your own event.",
      "communityStripe": "The community needs <b>Stripe connected</b>",
      "personalStripe": "You need <b>Stripe connected</b>",
      "communityCobuntuFee": "Cobuntu takes <b>{rate}</b>",
      "communityCobuntuFeeUnknown": "Cobuntu's <b>platform fee</b> applies",
      "personalCobuntuFee": "Cobuntu takes <b>4% + €0.30</b> of your share",
      "communityOptions": "You also choose <b>who can see it and who can get a ticket</b>",
      "personalOptions": "You pick <b>which arrangement</b>, if the community offers more than one"
    }
  },
  "marketplaceUi": {
    "firstTimeCreatorModal": {
      "heading": "{kind, select, event {Before you host your first event in {communityName}} other {Before you list your first product in {communityName}}}",
      "subtitle": "Three quick things to know. You only see this once.",
      "point1Title": "It's yours",
      "point1Body": "{kind, select, event {You own the event. Your name is on it, your payouts go to your Stripe account, and you set the price.} other {You own the product. Your name is on it, your payouts go to your Stripe account, and you set the price.}}",
      "point2Title": "The community takes a commission",
      "point2Body": "{communityName} takes a percentage on each sale. The rate depends on this community's pricing model and your seller tier. See it in detail on <link>the selling guide</link>.",
      "point3Title": "Approval might be required",
      "point3Body": "If {communityName} requires approval, your submission enters a review queue. Leaders see it, can ask questions, and approve or decline before it goes live.",
      "readFullGuide": "Read the full guide",
      "gotIt": "{kind, select, event {Got it, let's host} other {Got it, let's list}}"
    }
  },
  "shared": {
    "howItWorksButton": {
      "ariaLabel": "How selling works in this community",
      "label": "How it works"
    }
  }
} as const;

export type EventWizardMessages = typeof EVENT_WIZARD_MESSAGES_EN;
