import { nanoid } from "nanoid";
import { HttpsError } from "firebase-functions/v2/https";
import { callable, noopCallable, requireAuth } from "../helpers/callable";
import { getFirestore } from "../admin";
import { publicAppUrl, sendMail } from "../helpers/mailer";

// SharedLists let a user expose a read-only set of rules under a URL like
// `<app>/rules#sharedList/<id>-<name>`. The rule payload sits in the shared-list
// doc; viewing it does NOT require auth (the read path resolves the doc directly).

type SharedListVisibility = "public" | "private";

type CreateInput = {
  rules: unknown[];
  updatedGroups: unknown[];
  sharedListName: string;
  sharedListVisibility: SharedListVisibility;
  sharedListRecipients?: string[];
  teamId?: string | null;
  notifyOnImport?: boolean;
};

type SharedListDoc = {
  id: string;
  sharedListName: string;
  sharedListVisibility: SharedListVisibility;
  sharedListRecipients?: string[];
  sharedListData: {
    name: string;
    rules: unknown[];
    groups: unknown[];
  };
  ownerId: string;
  teamId?: string | null;
  notifyOnImport?: boolean;
  createdAt: number;
};

const lists = () => getFirestore().collection("sharedLists");

const slugify = (name: string) =>
  name?.replace(/[ /]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") ?? "";

const buildShareUrl = (id: string, name: string) =>
  `${publicAppUrl()}/rules#sharedList/${id}-${slugify(name)}`;

export const create = callable<
  CreateInput,
  {
    success: boolean;
    sharedListId: string;
    sharedListName: string;
    sharedListData: SharedListDoc["sharedListData"];
    nonRQEmails: string[];
  }
>(async (req) => {
  const uid = requireAuth(req);
  const data = req.data;
  if (!data?.sharedListName?.trim()) {
    throw new HttpsError("invalid-argument", "sharedListName is required");
  }

  const id = nanoid(10);
  const doc: SharedListDoc = {
    id,
    sharedListName: data.sharedListName.trim(),
    sharedListVisibility: data.sharedListVisibility,
    sharedListRecipients: data.sharedListRecipients,
    sharedListData: {
      name: data.sharedListName.trim(),
      rules: data.rules ?? [],
      groups: data.updatedGroups ?? [],
    },
    ownerId: uid,
    teamId: data.teamId ?? null,
    notifyOnImport: data.notifyOnImport,
    createdAt: Date.now(),
  };
  await lists().doc(id).set(doc);

  return {
    success: true,
    sharedListId: id,
    sharedListName: doc.sharedListName,
    sharedListData: doc.sharedListData,
    // Self-host can't (cheaply) check which emails have RQ accounts. Treat
    // everyone as a "non-RQ" recipient so they all get the share email.
    nonRQEmails: data.sharedListRecipients ?? [],
  };
});

// `delete` is reserved in JS, but ES2022 module exports support string aliases.
const deleteFn = callable<{ sharedListId: string }, { success: boolean }>(async (req) => {
  const uid = requireAuth(req);
  const ref = lists().doc(req.data.sharedListId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "shared list not found");
  if ((snap.data() as SharedListDoc).ownerId !== uid) {
    throw new HttpsError("permission-denied", "not owner");
  }
  await ref.delete();
  return { success: true };
});
export { deleteFn as "delete" };

// Mails the recipients a link to the shared list. Called after `sharedLists-create`
// returns. The client passes the doc shape back to us, but we re-derive everything
// from Firestore so a malicious client can't doctor the email body.
export const sendShareEmail = callable<
  {
    sharedListData?: { id?: string; sharedListId?: string; sharedListName?: string };
    recipientEmails: string[];
  },
  { success: boolean }
>(async (req) => {
  const uid = requireAuth(req);
  const recipients = (req.data?.recipientEmails ?? []).filter((e) => typeof e === "string" && e.includes("@"));
  if (recipients.length === 0) return { success: true };

  const inputId = req.data?.sharedListData?.id ?? req.data?.sharedListData?.sharedListId;
  if (!inputId) throw new HttpsError("invalid-argument", "missing shared list id");

  const snap = await lists().doc(inputId).get();
  if (!snap.exists) throw new HttpsError("not-found", "shared list not found");
  const list = snap.data() as SharedListDoc;
  if (list.ownerId !== uid) throw new HttpsError("permission-denied", "not owner");

  const url = buildShareUrl(list.id, list.sharedListName);
  const subject = `${list.sharedListName} shared with you on Requestly`;
  const text = `You've been given access to a Requestly rule list "${list.sharedListName}".\n\nOpen it here: ${url}`;
  const html = `<p>You've been given access to a Requestly rule list <strong>${escapeHtml(
    list.sharedListName,
  )}</strong>.</p><p><a href="${url}">Open the shared list</a></p>`;

  await sendMail({ to: recipients, subject, text, html });
  return { success: true };
});

// Sales-side Apollo notification — no-op in self-host.
export const sendImportAsEmail = noopCallable("sharedLists-sendImportAsEmail");

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
