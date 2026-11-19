import { createHash, timingSafeEqual } from "node:crypto";
import { AuthError } from "@/lib/errors";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_MAX_IP_FAILURES = 30;
export const RESET_WINDOW_MS = 60 * 60 * 1000;
export const RESET_MAX_REQUESTS = 3;
export const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_MS = 60 * 60 * 1000;

export type RoleName = "OWNER" | "STAFF";

export function roleAllowed(role: RoleName, allowed: RoleName[]): boolean {
  return allowed.includes(role);
}

export function assertRole(role: RoleName, allowed: RoleName[]): void {
  if (!roleAllowed(role, allowed)) {
    throw new AuthError(allowed.includes("STAFF") ? "Sign in to do that." : "Only the owner can do that.");
  }
}

export function canSignIn(user: { active: boolean } | null): boolean {
  return Boolean(user?.active);
}

export function loginIsLimited(failuresInWindow: number, limit = LOGIN_MAX_FAILURES): boolean {
  return failuresInWindow >= limit;
}

export function resetRequestIsLimited(requestsInWindow: number): boolean {
  return requestsInWindow >= RESET_MAX_REQUESTS;
}

export function resetTokenUsable(
  row: { status: string; expiresAt: Date | null; usedAt: Date | null },
  now: Date,
): boolean {
  if (row.status !== "APPROVED") return false;
  if (row.usedAt) return false;
  if (!row.expiresAt || row.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function sessionTokenHash(token: string, secret: string): string {
  if (secret.length < 16) throw new AuthError("AUTH_SECRET is too short.");
  if (!token) throw new AuthError("Missing session.");
  return createHash("sha256").update(secret).update(".").update(token).digest("hex");
}

export function secretsMatch(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function assertCronAuthorized(header: string | null, secret: string | undefined): void {
  if (!secret || secret.length < 16) {
    throw new AuthError("CRON_SECRET is not set.");
  }
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!provided || !secretsMatch(provided, secret)) {
    throw new AuthError("That cron secret is not right.");
  }
}

export function passwordIsAcceptable(password: string, email: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  if (password.toLowerCase() === email.trim().toLowerCase()) return "Do not use the email as the password.";
  return null;
}
