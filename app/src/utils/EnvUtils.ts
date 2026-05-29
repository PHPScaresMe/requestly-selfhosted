enum NODE_ENV {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
}

enum BACKEND_ENV {
  PROD = "prod",
  BETA = "beta",
  EMULATOR = "emulator",
  SELF_HOSTED = "self-hosted",
}

const getBackendEnv = () => {
  return process.env.VITE_BACKEND_ENV as BACKEND_ENV;
};

const getNodeEnv = () => {
  return process.env.NODE_ENV as NODE_ENV;
};

window.__rq_debug__ = window.__rq_debug__ || {};
window.__rq_debug__.backendEnv = getBackendEnv();
window.__rq_debug__.nodeEnv = getNodeEnv();
window.__rq_debug__.mode = import.meta?.env?.MODE;

/* When running local emulator */
export const isBackendEnvEmulator = (): boolean => {
  return getBackendEnv() === BACKEND_ENV.EMULATOR;
};

/* When backend is requestly beta */
export const isBackendEnvBeta = (): boolean => {
  return getBackendEnv() === BACKEND_ENV.BETA;
};

/**
 * Self-hosted mode: the app is running against a user-controlled backend (the
 * `server/` workspace in this repo). Most sales/billing/Apollo UI is suppressed,
 * every authenticated user is treated as premium, and external services
 * (GrowthBook, Sentry, analytics, Stripe) are stubbed/skipped.
 *
 * Toggled by `VITE_SELF_HOSTED=true` at build time, or by setting the
 * `__rq_self_hosted__` window flag at runtime (useful for the Docker entrypoint
 * to inject the flag into a generic SPA build).
 */
export const isSelfHosted = (): boolean => {
  if (typeof window !== "undefined" && (window as any).__rq_self_hosted__) return true;
  return process.env.VITE_SELF_HOSTED === "true";
};

export const isNodeEnvDev = (): boolean => {
  return getNodeEnv() === NODE_ENV.DEVELOPMENT;
};

const detectHeadless = () => {
  return /HeadlessChrome/.test(window.navigator.userAgent) === true;
};

function bypassAutomation() {
  return localStorage.getItem("__BYPASS_AUTOMATION___");
}

export const isEnvAutomation = () => {
  return !bypassAutomation() && (window.navigator.webdriver === true || detectHeadless());
};
