// Empty stub for `@stripe/react-stripe-js` used in self-host builds. Mirrors the
// rationale in stripe-js-stub.ts. The components are no-ops; in self-host the
// billing/checkout UI is gated upstream so they never render anyway, but Vite
// still has to type-check their props and resolve the imports.

import React from "react";

const NoOp: React.FC<React.PropsWithChildren<unknown>> = ({ children }) => <>{children}</>;

export const Elements = NoOp;
export const EmbeddedCheckoutProvider = NoOp;
export const EmbeddedCheckout = NoOp;
export const CardElement: React.FC = () => null;

export const useStripe = () => null;
export const useElements = () => null;

export default {
  Elements,
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
  CardElement,
  useStripe,
  useElements,
};
