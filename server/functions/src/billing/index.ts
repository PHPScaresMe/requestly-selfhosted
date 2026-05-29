import { noopCallable, callable, requireAuth } from "../helpers/callable";
import { getFirestore } from "../admin";

// Self-host has no Stripe billing. The fetchBillingTeam callable is referenced by the
// "join team" flow when a user enters a billing-team code; return null so the UI
// reports "no team found." Other billing callables are pure SaaS-side and no-op.
export const fetchBillingTeam = callable<
  { billingId: string },
  { success: boolean; data: null }
>(async (req) => {
  requireAuth(req);
  return { success: true, data: null };
});

export const createBillingTeamInvites = noopCallable("billing-createBillingTeamInvites");
export const reviewBillingTeamJoiningRequest = noopCallable("billing-reviewBillingTeamJoiningRequest");
export const revokeBillingTeamInvite = noopCallable("billing-revokeBillingTeamInvite");

// Touching this anchors the Firestore type checker so the unused-import lint is happy.
void getFirestore;
