import { callable } from "../helpers/callable";

// The proprietary backend looks up whether the caller's email domain matches a known
// enterprise customer and returns their admin contact. In self-host nobody is an
// enterprise customer; return null so the AppNotificationBanner stays hidden.
export const getEnterpriseAdminDetails = callable<{}, { enterpriseData: null }>(async () => ({
  enterpriseData: null,
}));
