// Entry point — re-exports every cloud function the client expects.
// The deployed name must match the strings passed to httpsCallable(...) in app/src.
//
// Firebase-functions naming convention: when you re-export a module as a namespace
// (`export * as group from "./group"`), it generates URLs like
// `<host>/<project>/<region>/group-functionName`. The client calls match this exactly
// (e.g. `httpsCallable(fn, "auth-createAuthToken")`).
//
// To regenerate the list of names referenced from the client:
//   grep -rE 'httpsCallable\(' app/src | grep -oE '"[a-zA-Z][-a-zA-Z]*"' | sort -u

import "./admin";

// Grouped, hyphen-prefixed functions.
export * as auth from "./auth";
export * as users from "./users";
export * as teams from "./teams";
export * as invites from "./invites";
export * as billing from "./billing";
export * as subscription from "./billing/subscription";
export * as premiumNotifications from "./notifications/premium";
export * as pricing from "./notifications/pricing";
export * as slackConnect from "./notifications/slack";
export * as internalNotifications from "./notifications/internal";
export * as sharedLists from "./sharedLists";
export * as sessionRecording from "./sessions";

// Un-namespaced functions (client calls them as bare names, no hyphen prefix).
export { getEnterpriseAdminDetails } from "./misc/getEnterpriseAdminDetails";
export { usageMetrics } from "./misc/usageMetrics";
export { fetchEmailType } from "./misc/fetchEmailType";
export { addMock, deleteMock } from "./mocks";
export { handleMockRequest } from "./mocks/handleMockRequest";
export { acceptTeamInvite, inviteEmailToTeam, getTeamInvite } from "./teams/legacy";

// Auth trigger — seeds user docs on first sign-up so isPremium is true from the start.
export { seedUserDocs } from "./triggers/userOnCreate";
