/**
 * Can this community be paid the commission a member's paid listing implies?
 * Lifted from the community app (lib/communityCommissionGate.ts).
 *
 * MIRRORS THE SERVER: EventProposalService refuses when
 * `commissionRate > 0 && !community.stripeAccountId`. The community's account
 * is not in the checkout path; it is needed only to RECEIVE a commission, so a
 * 0% package leaves nothing to block on.
 *
 * Deliberately permissive: this gates a CREATE button, and a false block costs
 * a host their listing while a false allow costs one round trip. Every unknown
 * (payments undefined, no package chosen, a community-owned listing) allows.
 */
export interface CommissionGateInput {
  ownership: "community" | "personal";
  payments?: { connected: boolean; chargesEnabled: boolean };
  packages: Array<{ id: string; rate: number }>;
  packageId: string | null;
}

export function communityCannotTakeCommission({ ownership, payments, packages, packageId }: CommissionGateInput): boolean {
  if (ownership !== "personal") return false;
  if (!payments) return false;
  if (payments.connected) return false;
  const chosen = packages.find((p) => p.id === packageId);
  if (!chosen) return false;
  return chosen.rate > 0;
}
