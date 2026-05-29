import { onRequest } from "firebase-functions/v2/https";
import { MockServer } from "@requestly/mock-server";
import { FirestoreMockSource } from "./firestoreMockSource";

// HTTP cloud function that hosts the open-source mock-server Express app. The SPA
// constructs mock URLs against this endpoint:
//   <PUBLIC_APP_URL>/api/mockv2/<endpoint>?rq_uid=…&teamId=…&rq_password=…
//
// The mock-server is the standalone @requestly/mock-server npm package — we just
// inject our Firestore-backed ISource so it can resolve mock IDs from this
// project's data instead of the SaaS Firestore.
// Cast to any to bypass the package's sync ISource signature — see firestoreMockSource.ts.
const mockServer = new MockServer({
  pathPrefix: "/api/mockv2",
  storageConfig: { src: new FirestoreMockSource() as any },
});

export const handleMockRequest = onRequest({ cors: true }, mockServer.app);
