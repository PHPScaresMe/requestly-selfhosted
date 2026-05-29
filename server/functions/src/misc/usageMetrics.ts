import { noopCallable } from "../helpers/callable";

// Sales-team telemetry — no-op in self-host.
export const usageMetrics = noopCallable("usageMetrics");
