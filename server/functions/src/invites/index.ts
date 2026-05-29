import { HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { callable, requireAuth } from "../helpers/callable";
import { getAuth, getFirestore, FieldValue } from "../admin";
import { publicAppUrl, sendMail } from "../helpers/mailer";

// The client (app/src) shares an Invite shape across all auth/team flows:
//   { type: "teams", email?, metadata: { teamId, teamName, teamRole, ... }, usage, status, ... }
// We store invites in Firestore with this shape so verify/accept can echo it back.

type InviteUsage = "once" | "unlimited";
type InviteStatus = "pending" | "revoked" | "accepted";
type TeamRole = "admin" | "write" | "read";

type InviteMetadata = {
  teamId: string;
  teamName?: string;
  teamRole: TeamRole;
  ownerDisplayName?: string;
  ownerEmail?: string;
  teamAccessCount?: number;
  plan?: string;
  inviteId?: string;
};

type StoredInvite = {
  id: string;
  type: "teams";
  email?: string | null;
  ownerId: string; // the user who created the invite
  usage: InviteUsage;
  status: InviteStatus;
  usageCount: number;
  createdTs: number;
  updatedTs: number;
  expireTs: number;
  /** Common (anyone-with-link) invite when true. */
  public: boolean;
  /** Organization invite — auto-accept any signup from these domains. */
  domains?: string[];
  metadata: InviteMetadata;
};

const invites = () => getFirestore().collection("invites");
const teams = () => getFirestore().collection("teams");

const inviteUrl = (inviteId: string) => `${publicAppUrl()}/invite/${inviteId}`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

const requireTeamAdmin = async (uid: string, teamId: string) => {
  const snap = await teams().doc(teamId).get();
  if (!snap.exists) throw new HttpsError("not-found", "team not found");
  const team = snap.data() as { members?: Record<string, { role: string }> };
  if (team.members?.[uid]?.role !== "admin") {
    throw new HttpsError("permission-denied", "admin role required");
  }
};

const buildOwnerMetadata = async (
  uid: string,
): Promise<Pick<InviteMetadata, "ownerDisplayName" | "ownerEmail">> => {
  try {
    const u = await getAuth().getUser(uid);
    return { ownerDisplayName: u.displayName, ownerEmail: u.email ?? undefined };
  } catch {
    return {};
  }
};

const buildTeamMetadata = async (teamId: string): Promise<Pick<InviteMetadata, "teamName" | "teamAccessCount">> => {
  const snap = await teams().doc(teamId).get();
  const data = (snap.data() ?? {}) as { name?: string; members?: Record<string, unknown> };
  return {
    teamName: data.name,
    teamAccessCount: data.members ? Object.keys(data.members).length : undefined,
  };
};

const sendInviteEmail = async (params: { recipient: string; teamName?: string; inviterEmail?: string | null; inviteId: string }) => {
  const url = inviteUrl(params.inviteId);
  const teamName = params.teamName ?? "your team";
  const inviterLine = params.inviterEmail
    ? `${escapeHtml(params.inviterEmail)} has invited you`
    : "You've been invited";
  const subject = `You've been invited to ${teamName} on Requestly`;
  const text = `${inviterLine} to the "${teamName}" workspace on Requestly.\n\nAccept the invite: ${url}`;
  const html = `<p>${inviterLine} to the <strong>${escapeHtml(teamName)}</strong> workspace on Requestly.</p><p><a href="${url}">Accept the invite</a></p>`;
  await sendMail({ to: params.recipient, subject, text, html });
};

const baseInviteFields = (id: string, ownerId: string): Omit<StoredInvite, "metadata" | "email" | "public" | "domains"> => ({
  id,
  type: "teams",
  ownerId,
  usage: "once",
  status: "pending",
  usageCount: 0,
  createdTs: Date.now(),
  updatedTs: Date.now(),
  expireTs: 0, // 0 = no expiry
});

// -- Email invite -----------------------------------------------------------

export const createTeamInvites = callable<
  { teamId: string; emails: string[]; role?: TeamRole; teamName?: string },
  { success: boolean; inviteIds: string[] }
>(async (req) => {
  const uid = requireAuth(req);
  const { teamId, emails, role = "write" } = req.data;
  await requireTeamAdmin(uid, teamId);

  const [teamMeta, ownerMeta] = await Promise.all([buildTeamMetadata(teamId), buildOwnerMetadata(uid)]);

  const inviteIds = await Promise.all(
    (emails ?? []).map(async (email) => {
      const id = nanoid(12);
      const invite: StoredInvite = {
        ...baseInviteFields(id, uid),
        email: email.toLowerCase(),
        public: false,
        metadata: { teamId, teamRole: role, inviteId: id, ...teamMeta, ...ownerMeta },
      };
      await invites().doc(id).set(invite);
      try {
        await sendInviteEmail({ recipient: email, teamName: teamMeta.teamName, inviterEmail: ownerMeta.ownerEmail, inviteId: id });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("invite email failed", { email, err });
      }
      return id;
    }),
  );
  return { success: true, inviteIds };
});

// -- Organization (domain) invite -------------------------------------------

export const createOrganizationTeamInvite = callable<
  { teamId: string; domain: string; emails?: string[] },
  { success: boolean; inviteId: string }
>(async (req) => {
  const uid = requireAuth(req);
  const { teamId, domain, emails } = req.data;
  await requireTeamAdmin(uid, teamId);

  const [teamMeta, ownerMeta] = await Promise.all([buildTeamMetadata(teamId), buildOwnerMetadata(uid)]);

  const id = nanoid(12);
  const invite: StoredInvite = {
    ...baseInviteFields(id, uid),
    usage: "unlimited",
    public: false,
    domains: [domain.toLowerCase()],
    metadata: { teamId, teamRole: "write", inviteId: id, ...teamMeta, ...ownerMeta },
  };
  await invites().doc(id).set(invite);

  if (emails && emails.length > 0) {
    await Promise.all(
      emails.map((email) =>
        sendInviteEmail({ recipient: email, teamName: teamMeta.teamName, inviterEmail: ownerMeta.ownerEmail, inviteId: id }).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("org invite email failed", { email, err });
        }),
      ),
    );
  }

  return { success: true, inviteId: id };
});

// -- Common (public link) invite + per-team domain toggle -------------------

// The proprietary impl bundled two team-level toggles into one function:
//   - publicEnabled — gate for "anyone with the link can join" (the common invite doc)
//   - domainEnabled — gate for "auto-accept new signups with the same email domain"
// Callers pass one or the other (or both). We respect whichever is provided.
export const upsertTeamCommonInvite = callable<
  { teamId: string; publicEnabled?: boolean; domainEnabled?: boolean; enabled?: boolean },
  { success: boolean; inviteId: string | null }
>(async (req) => {
  const uid = requireAuth(req);
  const { teamId } = req.data;
  // Back-compat: older callers passed `enabled` meaning publicEnabled.
  const publicEnabled = req.data.publicEnabled ?? req.data.enabled;
  const domainEnabled = req.data.domainEnabled;
  await requireTeamAdmin(uid, teamId);

  if (typeof domainEnabled === "boolean") {
    await teams().doc(teamId).update({ domainEnabled });
  }

  const findExisting = () =>
    invites().where("metadata.teamId", "==", teamId).where("public", "==", true).limit(1).get();

  if (typeof publicEnabled !== "boolean") {
    const existing = await findExisting();
    return { success: true, inviteId: existing.empty ? null : existing.docs[0].id };
  }

  const existingSnap = await findExisting();

  if (!publicEnabled) {
    if (!existingSnap.empty) {
      await existingSnap.docs[0].ref.update({ status: "revoked", updatedTs: Date.now() });
    }
    return { success: true, inviteId: null };
  }

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0];
    if ((doc.data() as StoredInvite).status === "revoked") {
      await doc.ref.update({ status: "pending", updatedTs: Date.now() });
    }
    return { success: true, inviteId: doc.id };
  }

  const [teamMeta, ownerMeta] = await Promise.all([buildTeamMetadata(teamId), buildOwnerMetadata(uid)]);
  const id = nanoid(12);
  const invite: StoredInvite = {
    ...baseInviteFields(id, uid),
    usage: "unlimited",
    public: true,
    metadata: { teamId, teamRole: "write", inviteId: id, ...teamMeta, ...ownerMeta },
  };
  await invites().doc(id).set(invite);
  return { success: true, inviteId: id };
});

// Client (PublicInviteLink) reads `inviteId`, `public`, and `domains` to drive the UI.
export const getTeamPublicInvite = callable<
  { teamId: string },
  { success: boolean; inviteId: string | null; public: boolean; domains: string[] }
>(async (req) => {
  requireAuth(req);

  const publicSnap = await invites()
    .where("metadata.teamId", "==", req.data.teamId)
    .where("public", "==", true)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  const teamSnap = await teams().doc(req.data.teamId).get();
  const domainEnabled = (teamSnap.data() as { domainEnabled?: boolean } | undefined)?.domainEnabled === true;

  // Collect any domain-restricted invites' domain lists for the UI to display.
  let domains: string[] = [];
  if (domainEnabled) {
    const domainSnap = await invites()
      .where("metadata.teamId", "==", req.data.teamId)
      .where("status", "==", "pending")
      .get();
    domainSnap.docs.forEach((d) => {
      const data = d.data() as { domains?: string[] };
      if (data.domains?.length) domains = domains.concat(data.domains);
    });
  }

  return {
    success: true,
    inviteId: publicSnap.empty ? null : publicSnap.docs[0].id,
    public: !publicSnap.empty,
    domains,
  };
});

// -- Verify / accept --------------------------------------------------------

// NOT auth-required: invite links must open in an unauthenticated browser so the
// recipient can see what they're joining before they sign up.
export const verifyInvite = callable<
  { inviteId: string },
  { success: boolean; error?: string; data?: { invite: StoredInvite } }
>(async (req) => {
  const snap = await invites().doc(req.data.inviteId).get();
  if (!snap.exists) {
    return { success: false, error: "invite_not_found" };
  }
  const invite = snap.data() as StoredInvite;

  if (invite.status === "revoked") return { success: false, error: "invite_not_found", data: { invite } };
  if (invite.status === "accepted" && invite.usage === "once") {
    return { success: false, error: "invite_already_accepted", data: { invite } };
  }
  if (invite.expireTs && invite.expireTs < Date.now()) {
    return { success: false, error: "invite_expired", data: { invite } };
  }

  // The client requires the user to be logged in before showing the accept button,
  // but the verify call itself is unauthenticated and returns the invite shape so
  // the auth screen can display a personalized "join <teamName>" header.
  if (!req.auth?.uid) {
    return { success: false, error: "not_logged_in", data: { invite } };
  }

  // For an email-typed invite, the signed-in user must match.
  if (invite.email) {
    try {
      const u = await getAuth().getUser(req.auth.uid);
      if ((u.email ?? "").toLowerCase() !== invite.email) {
        return { success: false, error: "invalid_email", data: { invite } };
      }
    } catch {
      return { success: false, error: "invalid_email", data: { invite } };
    }
  }

  return { success: true, data: { invite } };
});

export const acceptInvite = callable<
  { inviteId: string },
  { success: boolean; message?: string; data?: { invite: StoredInvite } }
>(async (req) => {
  const uid = requireAuth(req);
  const ref = invites().doc(req.data.inviteId);
  const snap = await ref.get();
  if (!snap.exists) return { success: false, message: "invite not found" };
  const invite = snap.data() as StoredInvite;
  if (invite.status === "revoked") return { success: false, message: "invite no longer valid" };
  if (invite.status === "accepted" && invite.usage === "once") {
    return { success: false, message: "invite already accepted" };
  }
  if (invite.expireTs && invite.expireTs < Date.now()) {
    return { success: false, message: "invite expired" };
  }

  // Email-bound invite: the signed-in user must match.
  if (invite.email) {
    const u = await getAuth().getUser(uid);
    if ((u.email ?? "").toLowerCase() !== invite.email) {
      return { success: false, message: "this invite was for a different email" };
    }
  }

  // Organization invite: the signed-in user's domain must match.
  if (invite.domains?.length) {
    const u = await getAuth().getUser(uid);
    const domain = (u.email ?? "").split("@")[1]?.toLowerCase();
    if (!domain || !invite.domains.includes(domain)) {
      return { success: false, message: "your email domain doesn't match this invite" };
    }
  }

  await teams().doc(invite.metadata.teamId).update({
    [`members.${uid}`]: { role: invite.metadata.teamRole },
    membersCount: FieldValue.increment(1),
  });

  await ref.update({
    usageCount: FieldValue.increment(1),
    status: invite.usage === "once" ? "accepted" : "pending",
    updatedTs: Date.now(),
  });

  return { success: true, data: { invite } };
});

export const revokeInvite = callable<{ inviteId: string }, { success: boolean }>(async (req) => {
  const uid = requireAuth(req);
  const ref = invites().doc(req.data.inviteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "invite not found");
  const invite = snap.data() as StoredInvite;
  await requireTeamAdmin(uid, invite.metadata.teamId);
  await ref.update({ status: "revoked", updatedTs: Date.now() });
  return { success: true };
});
