// Empty stub for `@stripe/stripe-js` used in self-host builds. The real package
// has a module-init side effect (`Promise.resolve().then(loadScript(null))`)
// that injects the Stripe JS into the page the moment the module is imported,
// regardless of whether `loadStripe()` is ever called. Aliasing the package to
// this stub via vite.config.ts keeps Stripe from ever being touched.

export const loadStripe = (..._args: unknown[]) => Promise.resolve(null);
export default { loadStripe };
