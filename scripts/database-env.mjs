import { existsSync, readFileSync } from "node:fs";

function loadEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Migrations need a direct Neon connection. The running app uses the pooled URL.
 * When only one of the two is set, both names point at it.
 */
export function applyDatabaseEnv() {
  loadEnvFile();
  const pooled = process.env.DATABASE_URL;
  const direct = process.env.DATABASE_URL_UNPOOLED || pooled;
  if (!process.env.DATABASE_URL && direct) process.env.DATABASE_URL = direct;
  if (direct) process.env.DATABASE_URL_UNPOOLED = direct;
  return process.env.DATABASE_URL || "";
}
