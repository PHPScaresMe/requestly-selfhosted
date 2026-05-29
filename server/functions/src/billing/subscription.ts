import { noopCallable } from "../helpers/callable";

// Stripe checkout / customer-portal links. Self-host has no Stripe — no-op so the
// "Manage subscription" buttons don't error.
export const manageSubscription = noopCallable("subscription-manageSubscription");
export const createSubscriptionUsingCheckout = noopCallable("subscription-createSubscriptionUsingCheckout");
