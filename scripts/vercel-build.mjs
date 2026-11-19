import { spawnSync } from "node:child_process";
import { applyDatabaseEnv } from "./database-env.mjs";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
}

// Deploy builds migrate the database and compile the app.
// They do not import stock, repair passwords, or rewrite client rows.
if (!applyDatabaseEnv()) {
  console.error("DATABASE_URL is not set. Add the Neon connection strings in Vercel.");
  process.exit(1);
}

run("npx", ["prisma", "generate"]);
run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["next", "build"]);
