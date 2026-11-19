import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { AuthError, DeskError } from "@/lib/errors";
import {
  LOGIN_MAX_IP_FAILURES,
  LOGIN_WINDOW_MS,
  RESET_TOKEN_MS,
  RESET_WINDOW_MS,
  loginIsLimited,
  passwordIsAcceptable,
  resetRequestIsLimited,
  resetTokenUsable,
  sessionTokenHash,
} from "@/lib/auth-policy";
import { getAuthSecret } from "@/lib/secret";
import { teamMemberSchema, zodMessage } from "@/lib/schemas";

// A real bcrypt hash so an unknown email takes the same time as a wrong password.
const DUMMY_PASSWORD_HASH = "$2b$12$hyg4u1XRN.Y.vbS74JCq9e3uR4flMb8GqCEjAImixpdnDFX9srA7a";

export async function authenticate(email: string, password: string, ip: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new AuthError("Email or password is not right.");
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [emailFailures, ipFailures] = await Promise.all([
    db.loginAttempt.count({ where: { email: normalized, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (loginIsLimited(emailFailures) || loginIsLimited(ipFailures, LOGIN_MAX_IP_FAILURES)) {
    throw new AuthError("Too many tries. Wait 15 minutes and try again.");
  }
  const user = await db.user.findUnique({ where: { email: normalized } });
  const match = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH).catch(() => false);
  const ok = Boolean(user && user.active && match);
  await db.loginAttempt.create({ data: { email: normalized, ip, success: ok } });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  if (!ok || !user) throw new AuthError("Email or password is not right.");
  await db.accountAudit.create({ data: { actorId: user.id, action: "login", detail: "Signed in" } });
  return user;
}

export async function createStaff(actorId: string, input: { name: string; email: string; password: string }) {
  const parsed = teamMemberSchema.safeParse(input);
  if (!parsed.success) throw new DeskError(zodMessage(parsed.error));
  const { email, name, password } = parsed.data;
  const problem = passwordIsAcceptable(password, email);
  if (problem) throw new DeskError(problem);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new DeskError("That email is already on the team.");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { name, email, passwordHash, role: "STAFF" },
  });
  await db.accountAudit.create({ data: { actorId, action: "staff-created", detail: email } });
  return user;
}

export async function setUserPassword(actorId: string, userId: string, password: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new DeskError("That person is not on the team.");
  const problem = passwordIsAcceptable(password, user.email);
  if (problem) throw new DeskError(problem);
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.passwordReset.updateMany({
      where: { userId: user.id, status: { in: ["REQUESTED", "APPROVED"] } },
      data: { status: "USED", usedAt: new Date() },
    }),
    db.accountAudit.create({ data: { actorId, action: "password-set", detail: user.email } }),
  ]);
}

export async function setUserActive(actorId: string, userId: string, active: boolean) {
  if (actorId === userId && !active) throw new DeskError("You cannot turn off your own sign-in.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new DeskError("That person is not on the team.");
  if (!active && user.role === "OWNER") {
    const owners = await db.user.count({ where: { role: "OWNER", active: true } });
    if (owners <= 1) throw new DeskError("Keep at least one owner who can sign in.");
  }
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { active } }),
    ...(active ? [] : [db.session.deleteMany({ where: { userId: user.id } })]),
    db.accountAudit.create({
      data: { actorId, action: active ? "user-activated" : "user-deactivated", detail: user.email },
    }),
  ]);
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = normalized ? await db.user.findUnique({ where: { email: normalized } }) : null;
  if (!user || !user.active) return;
  const since = new Date(Date.now() - RESET_WINDOW_MS);
  const recent = await db.passwordReset.count({
    where: { userId: user.id, requestedAt: { gte: since } },
  });
  if (resetRequestIsLimited(recent)) return;
  const open = await db.passwordReset.findFirst({
    where: { userId: user.id, status: "REQUESTED" },
  });
  if (open) return;
  await db.passwordReset.create({ data: { userId: user.id, status: "REQUESTED" } });
  await db.accountAudit.create({ data: { actorId: user.id, action: "reset-requested", detail: user.email } });
}

export async function approvePasswordReset(actorId: string, resetId: string): Promise<string> {
  const row = await db.passwordReset.findUnique({ where: { id: resetId }, include: { user: true } });
  if (!row || row.status !== "REQUESTED" || !row.user.active) {
    throw new DeskError("That reset request is no longer waiting.");
  }
  const token = randomBytes(32).toString("base64url");
  await db.passwordReset.update({
    where: { id: row.id },
    data: {
      status: "APPROVED",
      tokenHash: sessionTokenHash(token, getAuthSecret()),
      expiresAt: new Date(Date.now() + RESET_TOKEN_MS),
    },
  });
  await db.accountAudit.create({ data: { actorId, action: "reset-approved", detail: row.user.email } });
  return token;
}

export async function completePasswordReset(token: string, password: string) {
  const trimmed = token.trim();
  if (trimmed.length < 20) throw new DeskError("That reset code is not valid.");
  const row = await db.passwordReset.findUnique({
    where: { tokenHash: sessionTokenHash(trimmed, getAuthSecret()) },
    include: { user: true },
  });
  if (!row || !resetTokenUsable(row, new Date()) || !row.user.active) {
    throw new DeskError("That reset code is used or expired. Ask the owner for a new one.");
  }
  const problem = passwordIsAcceptable(password, row.user.email);
  if (problem) throw new DeskError(problem);
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    db.passwordReset.update({ where: { id: row.id }, data: { status: "USED", usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: row.userId } }),
    db.accountAudit.create({ data: { actorId: row.userId, action: "password-reset", detail: row.user.email } }),
  ]);
}
