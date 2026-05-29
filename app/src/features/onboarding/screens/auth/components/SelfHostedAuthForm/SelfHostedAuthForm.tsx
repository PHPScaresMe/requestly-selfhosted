import React, { useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import { RQButton } from "lib/design-system-v2/components";
import { AuthFormInput } from "../RQAuthCard/components/AuthFormInput/AuthFormInput";
import { emailSignIn, signUp } from "actions/FirebaseActions";
import { isEmailValid } from "utils/FormattingHelper";
import { toast } from "utils/Toast";
import { useAuthScreenContext } from "../../context";
import { globalActions } from "store/slices/global/slice";
import APP_CONSTANTS from "config/constants";

type Mode = "login" | "signup";

// Self-host doesn't have SMTP wired by default, so magic-link sign-in and BrowserStack
// OAuth (the two paths the new auth UI offers) both fail. This component is a minimal
// email + password form that talks straight to Firebase Auth. Shown only when
// `isSelfHosted()` is true.
export const SelfHostedAuthForm: React.FC = () => {
  const dispatch = useDispatch();
  const { email, handleEmailChange, toggleAuthModal, eventSource } = useAuthScreenContext();
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [isLoading, setIsLoading] = useState(false);

  const closeAuthModal = useCallback(() => {
    toggleAuthModal(false);
    dispatch(
      globalActions.toggleActiveModal({
        modalName: "authModal",
        newValue: false,
      }),
    );
  }, [dispatch, toggleAuthModal]);

  const handleSubmit = useCallback(async () => {
    if (!isEmailValid(email)) {
      toast.error("Please enter a valid email");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsLoading(true);
    try {
      if (mode === "signup") {
        await signUp(email, password, undefined, eventSource);
        // signUp doesn't auto-sign-in in all paths; ensure we end up signed in.
        await emailSignIn(email, password, true, eventSource);
      } else {
        await emailSignIn(email, password, false, eventSource);
      }
      closeAuthModal();
    } catch (err: any) {
      const code = err?.errorCode || err?.code || "";
      const msg =
        code === "auth/email-already-in-use"
          ? "An account with this email already exists. Try signing in."
          : code === "auth/wrong-password" || code === "auth/invalid-credential"
            ? "Incorrect email or password."
            : code === "auth/user-not-found"
              ? "No account with this email. Try creating one."
              : err?.message || "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [mode, email, password, eventSource, closeAuthModal]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, minWidth: 360 }}>
      <div className="onboarding-card-title">
        {mode === "login" ? "Sign in to your account" : "Create your account"}
      </div>
      <AuthFormInput
        label="Email"
        placeholder="you@example.com"
        type="email"
        value={email}
        onValueChange={handleEmailChange}
        autoFocus
      />
      <AuthFormInput
        label="Password"
        placeholder={mode === "signup" ? "Choose a password (min 6 chars)" : "Your password"}
        type="password"
        value={password}
        onValueChange={setPassword}
        onPressEnter={handleSubmit}
      />
      <RQButton
        size="large"
        type="primary"
        block
        loading={isLoading}
        disabled={!email || !password}
        onClick={handleSubmit}
      >
        {mode === "login" ? "Sign in" : "Create account"}
      </RQButton>
      <div style={{ textAlign: "center", fontSize: 13 }}>
        {mode === "login" ? (
          <>
            New here?{" "}
            <a
              role="button"
              tabIndex={0}
              onClick={() => setMode("signup")}
              onKeyDown={(e) => e.key === "Enter" && setMode("signup")}
            >
              Create an account
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a
              role="button"
              tabIndex={0}
              onClick={() => setMode("login")}
              onKeyDown={(e) => e.key === "Enter" && setMode("login")}
            >
              Sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
};

// Re-export the AUTH_LABELS purely so the consumer of this file doesn't need to also
// import from elsewhere just to compare modes.
export const SELF_HOSTED_AUTH_MODES = APP_CONSTANTS.AUTH.ACTION_LABELS;
