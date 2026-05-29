import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

export type Handler<Req, Res> = (req: CallableRequest<Req>) => Promise<Res> | Res;

/**
 * Wraps an onCall handler with a consistent error envelope. Firebase callable functions
 * already handle their own envelope, but the client code in app/src expects various
 * `{ success, data, message }` response shapes depending on the function; each impl
 * picks its own shape inside the handler.
 */
export const callable = <Req = unknown, Res = unknown>(handler: Handler<Req, Res>) =>
  onCall<Req, Res | Promise<Res>>(async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("callable handler threw", err);
      throw new HttpsError("internal", (err as Error)?.message ?? "internal error");
    }
  });

/**
 * No-op callable for cloud functions that exist purely for SaaS-side sales / billing /
 * Apollo email sequences. In self-host these have no behavior — we return a
 * success-shaped envelope so the client UI doesn't surface an error.
 */
export const noopCallable = (label: string) =>
  callable(async (req) => {
    logger.debug(`[stub] ${label} called`, { uid: req.auth?.uid, data: req.data });
    return { success: true } as const;
  });

export const requireAuth = (req: CallableRequest<unknown>): string => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return uid;
};
