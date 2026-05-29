import { getFirestore, getStorage } from "../admin";
import { logger } from "firebase-functions";

// ISource adapter that reads mocks from our Firestore + Storage emulators. The SPA writes
// mocks to:
//   - mocks/{mockId} — full mock doc with responses[]
//   - user-mocks-metadata/{ownerId} — { mockSelectors: { [mockId]: { endpoint, method, ... } } }
//   - Storage at <storagePath>/body/<responseId> — response body bytes
// ownerId is `team-<teamId>` for shared workspaces, or the bare uid for personal.
// Bodies live in Storage (not Firestore) when BODY_IN_BUCKET_ENABLED is on in the SPA;
// the Firestore response doc has body=null and we have to hydrate it from Storage.
//
// Not declaring `implements ISource` here because the package's type signature
// declares getMock/getMockSelectorMap as synchronous (returns Mock | null), but
// the storageService internally awaits the result so async impls work at runtime.

// The mock-server passes `{ queryParams: req.query }` (see mockHandler.ts), so we
// dig into queryParams to find rq_uid / teamId.
const extractOwnerId = (kwargs: any): string | null => {
  const qp = kwargs?.queryParams ?? kwargs ?? {};
  const teamId = qp.teamId;
  const rq_uid = qp.rq_uid;
  if (teamId) return `team-${teamId}`;
  if (rq_uid) return rq_uid;
  return null;
};

// Default emulator bucket name. Matches projectId.appspot.com — the SPA's
// firebase init uses this for storageBucket.
const BUCKET_NAME = "requestly-self-hosted.appspot.com";

const readBodyFromStorage = async (filePath: string): Promise<string | null> => {
  try {
    const file = getStorage().bucket(BUCKET_NAME).file(filePath);
    const [contents] = await file.download();
    return contents.toString("utf-8");
  } catch (err) {
    logger.warn("failed to read mock response body from storage", { filePath, err });
    return null;
  }
};

export class FirestoreMockSource {
  getMockSelectorMap = async (kwargs?: any) => {
    const ownerId = extractOwnerId(kwargs);
    if (!ownerId) return {};
    const snap = await getFirestore().collection("user-mocks-metadata").doc(ownerId).get();
    const data = snap.data() as { mockSelectors?: Record<string, unknown> } | undefined;
    return data?.mockSelectors ?? {};
  };

  getMock = async (id: string) => {
    const snap = await getFirestore().collection("mocks").doc(id).get();
    if (!snap.exists) return null;
    const mock = snap.data() as { responses?: Array<{ body?: string | null; filePath?: string }> };

    // Hydrate response bodies from Storage when filePath is set and body is null.
    if (mock?.responses?.length) {
      await Promise.all(
        mock.responses.map(async (response) => {
          if (response.filePath && (response.body === null || response.body === undefined)) {
            const fromStorage = await readBodyFromStorage(response.filePath);
            // Fall back to empty string so the templating engine doesn't crash on null.
            response.body = fromStorage ?? "";
          }
        }),
      );
    }

    return mock;
  };
}
