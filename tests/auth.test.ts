import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_MAX_IP_FAILURES,
  assertCronAuthorized,
  assertRole,
  canSignIn,
  loginIsLimited,
  passwordIsAcceptable,
  resetRequestIsLimited,
  resetTokenUsable,
  secretsMatch,
  sessionTokenHash,
} from "@/lib/auth-policy";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("auth checks", () => {
  it("lets the owner through and stops staff on owner work", () => {
    expect(() => assertRole("OWNER", ["OWNER"])).not.toThrow();
    expect(() => assertRole("STAFF", ["OWNER"])).toThrow(/owner/);
    expect(() => assertRole("STAFF", ["OWNER", "STAFF"])).not.toThrow();
    expect(canSignIn({ active: true })).toBe(true);
    expect(canSignIn({ active: false })).toBe(false);
    expect(canSignIn(null)).toBe(false);
  });

  it("limits login and reset attempts", () => {
    expect(loginIsLimited(LOGIN_MAX_FAILURES - 1)).toBe(false);
    expect(loginIsLimited(LOGIN_MAX_FAILURES)).toBe(true);
    expect(loginIsLimited(LOGIN_MAX_IP_FAILURES, LOGIN_MAX_IP_FAILURES)).toBe(true);
    expect(resetRequestIsLimited(2)).toBe(false);
    expect(resetRequestIsLimited(3)).toBe(true);
  });

  it("hashes session tokens and compares secrets in constant length", () => {
    const hash = sessionTokenHash("plain-token", "a-secret-at-least-16");
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe("plain-token");
    expect(sessionTokenHash("plain-token", "a-secret-at-least-16")).toBe(hash);
    expect(secretsMatch("cron-secret-value", "cron-secret-value")).toBe(true);
    expect(secretsMatch("cron-secret-value", "other-secret-value")).toBe(false);
    expect(() => assertCronAuthorized("Bearer cron-secret-value", "cron-secret-value")).not.toThrow();
    expect(() => assertCronAuthorized("Bearer wrong", "cron-secret-value")).toThrow(/not right/);
    expect(() => assertCronAuthorized(null, "short")).toThrow(/CRON_SECRET/);
  });

  it("accepts a reset code only once, before it expires", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    expect(resetTokenUsable({ status: "APPROVED", expiresAt: new Date("2026-11-19T13:00:00Z"), usedAt: null }, now)).toBe(true);
    expect(resetTokenUsable({ status: "APPROVED", expiresAt: new Date("2026-11-19T12:00:00Z"), usedAt: null }, now)).toBe(false);
    expect(resetTokenUsable({ status: "USED", expiresAt: new Date("2026-11-19T13:00:00Z"), usedAt: now }, now)).toBe(false);
    expect(resetTokenUsable({ status: "REQUESTED", expiresAt: null, usedAt: null }, now)).toBe(false);
  });

  it("rejects a short password and the email itself", () => {
    expect(passwordIsAcceptable("short", "a@b.co")).toMatch(/10/);
    expect(passwordIsAcceptable("owner@kamo.example", "owner@kamo.example")).toMatch(/email/);
    expect(passwordIsAcceptable("cratekeep-owner", "owner@kamo.example")).toBeNull();
  });

  it("requires every server action and api route to check auth", () => {
    for (const name of readdirSync("src/server").filter((file) => file.endsWith(".ts"))) {
      const text = readFileSync(join("src/server", name), "utf8");
      const exports = text.match(/export async function /g)?.length ?? 0;
      if (name === "action.ts") {
        expect(text.includes('"use server"')).toBe(false);
        continue;
      }
      expect(text.startsWith('"use server"'), name).toBe(true);
      const guard = name === "public-actions.ts" ? /(?:return|await) publicWork\(/g : /(?:return|await) (?:ownerWork|deskWork)\(/g;
      expect(text.match(guard)?.length ?? 0, name).toBe(exports);
    }
    for (const path of walk("src/app/api").filter((file) => file.endsWith("route.ts"))) {
      const text = readFileSync(path, "utf8");
      if (path.includes(`${join("api", "cron")}`)) expect(text).toContain("assertCronAuthorized");
      else expect(text).toContain("requireApiUser");
    }
  });
});
