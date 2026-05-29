import { HttpsError } from "firebase-functions/v2/https";
import { callable, requireAuth } from "../helpers/callable";
import { getAuth, getFirestore, FieldValue } from "../admin";

type TeamMemberRole = "admin" | "write" | "read";

type Team = {
  name: string;
  owner: string;
  members: Record<string, { role: TeamMemberRole }>;
  membersCount?: number;
  createdAt: number;
  isSyncEnabled?: boolean;
  workspaceType?: string;
};

const teams = () => getFirestore().collection("teams");

export const createTeam = callable<
  { teamName: string; emails?: string[] },
  { success: boolean; teamId: string }
>(async (req) => {
  const uid = requireAuth(req);
  const teamName = (req.data.teamName ?? "").trim();
  if (!teamName) throw new HttpsError("invalid-argument", "teamName is required");

  const doc = teams().doc();
  const team: Team = {
    name: teamName,
    owner: uid,
    members: { [uid]: { role: "admin" } },
    membersCount: 1,
    createdAt: Date.now(),
    isSyncEnabled: true,
  };
  await doc.set(team);
  return { success: true, teamId: doc.id };
});

export const deleteTeam = callable<{ teamId: string }, { success: boolean }>(async (req) => {
  const uid = requireAuth(req);
  const { teamId } = req.data;
  const snap = await teams().doc(teamId).get();
  if (!snap.exists) throw new HttpsError("not-found", "team not found");
  const team = snap.data() as Team;
  if (team.owner !== uid) throw new HttpsError("permission-denied", "only the owner can delete");
  await teams().doc(teamId).delete();
  return { success: true };
});

export const getTeamInfo = callable<{ teamId: string }, { success: boolean; data: Team | null }>(
  async (req) => {
    requireAuth(req);
    const snap = await teams().doc(req.data.teamId).get();
    return { success: true, data: snap.exists ? (snap.data() as Team) : null };
  },
);

export const getTeamUsers = callable<
  { teamId: string },
  { success: boolean; users: Array<{ uid: string; role: TeamMemberRole; email?: string; displayName?: string }> }
>(async (req) => {
  requireAuth(req);
  const snap = await teams().doc(req.data.teamId).get();
  if (!snap.exists) throw new HttpsError("not-found", "team not found");
  const team = snap.data() as Team;

  const uids = Object.keys(team.members ?? {});
  const records = await Promise.all(
    uids.map(async (uid) => {
      try {
        const authUser = await getAuth().getUser(uid);
        return {
          uid,
          role: team.members[uid].role,
          email: authUser.email,
          displayName: authUser.displayName,
        };
      } catch {
        return { uid, role: team.members[uid].role };
      }
    }),
  );
  return { success: true, users: records };
});

export const getPendingUsers = callable<
  { teamId: string },
  { success: boolean; users: unknown[] }
>(async (req) => {
  requireAuth(req);
  // Pending users come from the `invites` collection; for v1 return empty so the UI
  // renders without errors.
  return { success: true, users: [] };
});

// Client (TeamMembersTable) reads `response.subscriptionStatus` directly off the result.
export const getTeamSubscriptionInfo = callable<
  { teamId: string },
  { success: boolean; subscriptionStatus: string; plan: string }
>(async (req) => {
  requireAuth(req);
  return { success: true, subscriptionStatus: "active", plan: "self-hosted" };
});

// Client reads `response.billingExclude`.
export const getTeamBillingExclude = callable<
  { teamId: string },
  { success: boolean; billingExclude: string[] }
>(async (req) => {
  requireAuth(req);
  return { success: true, billingExclude: [] };
});

// Client reads `seatsData.billQuantity` and `seatsData.actualBillQuantity` to drive a
// "you have N seats" UI line. In self-host there's no seat limit; report current member
// count as both numbers so the line says "N active users" accurately.
export const getTeamBillingUsers = callable<
  { teamId: string },
  { success: boolean; billQuantity: number; actualBillQuantity: number; users: unknown[] }
>(async (req) => {
  requireAuth(req);
  const snap = await teams().doc(req.data.teamId).get();
  const memberCount = snap.exists ? Object.keys((snap.data() as Team).members ?? {}).length : 0;
  return { success: true, billQuantity: memberCount, actualBillQuantity: memberCount, users: [] };
});

export const isTeamAdmin = callable<{ teamId: string }, { success: boolean; isAdmin: boolean }>(
  async (req) => {
    const uid = requireAuth(req);
    const snap = await teams().doc(req.data.teamId).get();
    const team = snap.data() as Team | undefined;
    const isAdmin = team?.members?.[uid]?.role === "admin";
    return { success: true, isAdmin };
  },
);

export const updateTeamUserRole = callable<
  { teamId: string; userId: string; role: TeamMemberRole | "remove" },
  { success: boolean }
>(async (req) => {
  const uid = requireAuth(req);
  const { teamId, userId, role } = req.data;
  const ref = teams().doc(teamId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "team not found");
  const team = snap.data() as Team;
  if (team.members?.[uid]?.role !== "admin") {
    throw new HttpsError("permission-denied", "admin role required");
  }
  if (role === "remove") {
    await ref.update({
      [`members.${userId}`]: FieldValue.delete(),
      membersCount: FieldValue.increment(-1),
    });
  } else {
    await ref.update({
      [`members.${userId}`]: { role },
      membersCount: team.members?.[userId] ? team.membersCount : FieldValue.increment(1),
    });
  }
  return { success: true };
});

export const getPendingTeamInvites = callable<
  { email: boolean; domain: boolean },
  { success: boolean; pendingInvites: unknown[] }
>(async (req) => {
  requireAuth(req);
  return { success: true, pendingInvites: [] };
});
