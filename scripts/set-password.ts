import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { passwordIsAcceptable } from "../src/lib/auth-policy";

async function main() {
  const email = process.env.EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.PASSWORD ?? "";
  if (!email || !password) {
    console.error("Set EMAIL and PASSWORD in the environment, then run npm run password.");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error("That email is not on the team.");
    process.exit(1);
  }
  const problem = passwordIsAcceptable(password, email);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await db.session.deleteMany({ where: { userId: user.id } });
  console.log(`Password updated for ${email}. They need to sign in again.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
