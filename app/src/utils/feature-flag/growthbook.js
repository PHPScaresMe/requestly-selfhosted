import { GrowthBook } from "@growthbook/growthbook";
import { trackAttr, trackEvent } from "modules/analytics";
import { buildBasicUserProperties } from "modules/analytics/utils";
import { isSelfHosted } from "utils/EnvUtils";

// In self-host mode, point at a non-existent URL so GrowthBook never phones home.
// All `isOn`/`getFeatureValue` calls fall back to the SDK's local defaults — which is
// what we want: `show_upgrade_popovers` defaults to false, etc.
export const growthbook = new GrowthBook({
  apiHost: isSelfHosted() ? "http://127.0.0.1:0" : "https://cdn.growthbook.io",
  clientKey: isSelfHosted() ? "self-hosted" : process.env.VITE_GROWTHBOOK_CLIENT_KEY,
  enableDevMode: !isSelfHosted(),
  trackingCallback: (experiment, result) => {
    if (isSelfHosted()) return;
    trackEvent("experiment_assigned", { id: experiment.key, value: result.value });
  },
  onFeatureUsage: (featureKey, result) => {
    if (isSelfHosted()) return;
    const attrName = `x_flag_${featureKey}`;
    trackAttr(attrName, result?.value);
  },
});

export const initGrowthbook = (user, userAttributes) => {
  let id = null;
  let email = null;

  if (user) {
    const userData = buildBasicUserProperties(user);

    id = userData?.uid;
    email = userData?.email;
  }

  initGrowthbookAttributes(id, email, userAttributes);
};

// Hard Reset Growthbook Attributes.
// id & email kept here so no one can spoof if email by changing in local storage.
export const initGrowthbookAttributes = (id, email, userAttributes) => {
  const attributes = {
    ...userAttributes,
    id: id,
    email: email,
  };

  growthbook.setAttributes(attributes);
};

// Updates Growthbook attributes after every change in redux/local storage store
export const updateGrowthbookAttributes = (newAttributes = {}) => {
  const attributes = { ...growthbook.getAttributes(), ...newAttributes };
  growthbook.setAttributes(attributes);
};
