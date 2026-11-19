import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/errors";
import { SESSION_MS, canSignIn, roleAllowed, sessionTokenHash, type RoleName } from "@/lib/auth-policy";
import { cookieSecure, getAuthSecret } from "@/lib/secret";

export const SESSION_COOKIE = "cratekeep_session";
export { getAuthSecret };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: RoleName;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sessionTokenHash(token, getAuthSecret()) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !canSignIn(session.user)) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwnerPage(): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleAllowed(user.role, ["OWNER"])) {
    redirect(`/dashboard?error=${encodeURIComponent("Only the owner can open that.")}`);
  }
  return user;
}

export async function requireApiUser(allowed: RoleName[] = ["OWNER", "STAFF"]): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || !roleAllowed(user.role, allowed)) return null;
  return user;
}

export async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
  return headerList.get("x-real-ip")?.slice(0, 80) || "local";
}

export async function startSession(userId: string): Promise<void> {
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  const headerList = await headers();
  await db.session.create({
    data: {
      userId,
      tokenHash: sessionTokenHash(token, getAuthSecret()),
      expiresAt,
      userAgent: (headerList.get("user-agent") ?? "").slice(0, 200),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sessionTokenHash(token, getAuthSecret()) } });
  }
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function assertOwner(user: SessionUser): void {
  if (!roleAllowed(user.role, ["OWNER"])) throw new AuthError("Only the owner can do that.");
}
