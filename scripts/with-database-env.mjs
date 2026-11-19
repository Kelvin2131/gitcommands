import { spawnSync } from "node:child_process";
import { applyDatabaseEnv } from "./database-env.mjs";

applyDatabaseEnv();

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Usage: node scripts/with-database-env.mjs <command> [args...]");
  process.exit(1);
}

const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status === null ? 1 : result.status);
