import { callable } from "../helpers/callable";

// The proprietary backend classified emails as PERSONAL / DESTROYABLE / BUSINESS via
// some third-party service. In self-host this only feeds analytics attributes and
// the team-billing nudge — both of which we suppress already — so we return
// PERSONAL unconditionally. EmailType lives in @requestly/shared but we don't need
// to import it; the string values match the enum.
export const fetchEmailType = callable<
  { userEmail: string },
  { userEmail: string; type: "PERSONAL" | "DESTROYABLE" | "BUSINESS" }
>(async (req) => {
  return { userEmail: req.data?.userEmail ?? "", type: "PERSONAL" };
});
