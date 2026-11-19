"use server";

import { redirect } from "next/navigation";
import { clearSession } from "@/lib/session";
import { deskWork } from "@/server/action";

export async function signOut(): Promise<void> {
  await deskWork(async () => {
    await clearSession();
    redirect("/login");
  });
}
