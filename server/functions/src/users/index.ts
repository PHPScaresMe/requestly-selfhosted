import { callable } from "../helpers/callable";
import { getAuth } from "../admin";

// Called from the email-entry step of the auth flow (before the user is signed in)
// to decide which sign-in method to show. Takes `{ email }` and reports whether an
// account exists for that email and which providers are linked. The caller is NOT
// authenticated at this point.
type AuthProvider = "google.com" | "password" | "sso" | "github.com" | "saml.bstack";
type AuthSyncResponse = {
  success: boolean;
  syncData: {
    isExistingUser: boolean;
    isSyncedUser: boolean;
    providers: AuthProvider[];
    forceBstackAuth?: boolean;
  };
};

export const getAuthSyncData = callable<{ email: string }, AuthSyncResponse>(async (req) => {
  const email = (req.data?.email ?? "").trim().toLowerCase();
  if (!email) {
    return { success: false, syncData: { isExistingUser: false, isSyncedUser: false, providers: [] } };
  }
  try {
    const user = await getAuth().getUserByEmail(email);
    const providers = (user.providerData.map((p) => p.providerId) as AuthProvider[]) ?? [];
    if (providers.length === 0 && user.passwordHash) providers.push("password");
    return {
      success: true,
      syncData: { isExistingUser: true, isSyncedUser: true, providers },
    };
  } catch {
    // Auth admin throws auth/user-not-found for unknown emails — that's a successful
    // negative answer, not an error.
    return { success: true, syncData: { isExistingUser: false, isSyncedUser: false, providers: [] } };
  }
});

// Returns a headcount of users sharing an email domain — used purely for an analytics
// attribute ("companyUserSerial"). In self-host we always return zero; there's no point
// surfacing org headcount.
export const getOrganizationUsers = callable<
  { domain: string },
  { total: number; users: unknown[] }
>(async () => {
  return { total: 0, users: [] };
});
