import { noopCallable } from "../helpers/callable";

// Legacy mock CRUD callables. Current client paths write Firestore directly; these are
// only hit by old code or modal cleanup flows. Stub so they don't error.
export const addMock = noopCallable("addMock");
export const deleteMock = noopCallable("deleteMock");
