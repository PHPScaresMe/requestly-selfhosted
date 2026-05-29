import { PayloadAction } from "@reduxjs/toolkit";

import { GlobalModals, GlobalModalState } from "./types";
import { GlobalSliceState } from "../types";
import { isSelfHosted } from "utils/EnvUtils";

// In self-host mode there's no SaaS to upsell, so any attempt to open the pricing
// modal is ignored. The component itself stays intact for upstream merges.
const SELF_HOSTED_MODAL_BLOCKLIST: Array<keyof GlobalModals> = ["pricingModal"];

const toggleActiveModal = (
  prevState: GlobalSliceState,
  action: PayloadAction<{
    modalName: keyof GlobalModals;
    newValue?: GlobalModalState["isActive"];
    newProps?: GlobalModalState["props"];
  }>
) => {
  const modalName = action.payload.modalName;

  if (isSelfHosted() && SELF_HOSTED_MODAL_BLOCKLIST.includes(modalName) && action.payload.newValue) {
    return;
  }

  prevState.activeModals[modalName].isActive = action.payload.newValue ?? !prevState.activeModals[modalName].isActive;

  prevState.activeModals[modalName].props = action.payload.newProps ?? prevState.activeModals[modalName].props;
};

// Exporting like this because reference don't work if exported directly
// https://github.com/microsoft/TypeScript/issues/59134
const caseReducers = {
  toggleActiveModal,
};
export default caseReducers;
