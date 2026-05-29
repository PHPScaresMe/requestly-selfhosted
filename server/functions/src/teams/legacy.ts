import { noopCallable } from "../helpers/callable";

// Legacy un-namespaced callables referenced by older code paths in app/src. The
// modern paths use the namespaced `teams-*` / `invites-*` versions implemented in the
// sibling files. Keeping these as no-ops for compatibility.
export const acceptTeamInvite = noopCallable("acceptTeamInvite");
export const inviteEmailToTeam = noopCallable("inviteEmailToTeam");
export const getTeamInvite = noopCallable("getTeamInvite");
