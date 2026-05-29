import { HttpsError } from "firebase-functions/v2/https";
import { callable, noopCallable, requireAuth } from "../helpers/callable";
import { getAuth } from "../admin";
import { publicAppUrl, sendMail } from "../helpers/mailer";

// Sales-side Apollo capture for SSO interest — no-op in self-host.
export const captureSSOInterest = noopCallable("auth-captureSSOInterest");

// Generates a short-lived auth token for the desktop deep-link sign-in flow. The client
// calls this with the user's current refresh token; we mint a custom token that the
// desktop app exchanges for a session.
export const createAuthToken = callable<{}, { success: boolean; result: { customToken: string } }>(
  async (req) => {
    const uid = requireAuth(req);
    const customToken = await getAuth().createCustomToken(uid);
    return { success: true, result: { customToken } };
  },
);

// Used by the iframe SSO flow (`?refreshToken=...` query param). The proprietary impl
// validates the refresh token against the IDP; here we trust the caller's auth context.
export const generateCustomToken = callable<
  { refreshToken: string },
  { success: boolean; result: { customToken: string; message: string } }
>(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Must be signed in to exchange a refresh token.");
  }
  const customToken = await getAuth().createCustomToken(uid);
  return { success: true, result: { customToken, message: "ok" } };
});

// Self-host replacement for the SDK's sendPasswordResetEmail. The Auth Emulator's
// built-in flow captures the reset email into its dev UI instead of mailing it; we
// instead generate the same oobCode via admin SDK and SMTP it ourselves.
export const sendPasswordReset = callable<{ email: string }, { success: boolean }>(
  async (req) => {
    const email = (req.data?.email ?? "").trim().toLowerCase();
    if (!email) throw new HttpsError("invalid-argument", "email required");

    // Returns a URL like `<authDomain>/__/auth/action?mode=resetPassword&oobCode=…`
    // — we re-target the user at our own /emailAction page where the existing
    // verifyOobCode + confirmPasswordReset flow takes over.
    let oobCode: string | null = null;
    try {
      const link = await getAuth().generatePasswordResetLink(email, { url: publicAppUrl() });
      const u = new URL(link);
      oobCode = u.searchParams.get("oobCode");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/user-not-found") {
        // Treat as success to avoid exposing whether an email exists in the system.
        return { success: true };
      }
      throw err;
    }
    if (!oobCode) return { success: false };

    const url = `${publicAppUrl()}/emailAction?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
    const subject = "Reset your Requestly password";
    const text = `Someone requested a password reset for your Requestly account.\n\nIf this was you, open this link to choose a new password:\n${url}\n\nIf this wasn't you, you can ignore this email.`;
    const html = `<p>Someone requested a password reset for your Requestly account.</p><p>If this was you, <a href="${url}">click here to choose a new password</a>. If not, you can ignore this email.</p>`;

    await sendMail({ to: email, subject, text, html });
    return { success: true };
  },
);
