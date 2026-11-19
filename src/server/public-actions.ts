"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { authenticate, completePasswordReset, requestPasswordReset } from "@/lib/auth-service";
import { field, requireField } from "@/lib/form";
import { clientIp, startSession } from "@/lib/session";
import { publicWork } from "@/server/action";

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  return publicWork(async () => {
    const email = field(form, "email");
    const password = field(form, "password");
    const user = await authenticate(email, password, await clientIp());
    await startSession(user.id);
    redirect("/dashboard");
  });
}

export async function requestReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  return publicWork(async () => {
    await requestPasswordReset(field(form, "email"));
    return {
      ok: true,
      message: "If that email is on the team, the owner will see a reset request on the Team page.",
    };
  });
}

export async function completeReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  return publicWork(async () => {
    await completePasswordReset(requireField(form, "token", "Reset code"), requireField(form, "password", "Password"));
    redirect("/login?notice=" + encodeURIComponent("Password saved. Sign in with the new one."));
  });
}
