import { noopCallable } from "../helpers/callable";

// All four push leads/events into the SaaS Apollo pipeline. In self-host, no-op.
export const addUserToList = noopCallable("premiumNotifications-addUserToList");
export const requestAddPlan = noopCallable("premiumNotifications-requestAddPlan");
export const requestPlanSwitch = noopCallable("premiumNotifications-requestPlanSwitch");
export const salesInboundNotification = noopCallable("premiumNotifications-salesInboundNotification");
