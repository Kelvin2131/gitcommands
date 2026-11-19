export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is missing. Set a long random string before starting the desk.");
  }
  return "dev-only-auth-secret-not-for-production";
}

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "0") return false;
  return process.env.NODE_ENV === "production";
}
