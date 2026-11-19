import { spawnSync } from "node:child_process";
import { applyDatabaseEnv } from "./database-env.mjs";

// `prisma generate` reads the schema, which names these variables.
// A placeholder is enough; generate does not connect.
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/cratekeep";
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
}
applyDatabaseEnv();

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status === null ? 1 : result.status);
