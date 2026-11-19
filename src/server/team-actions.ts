"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { approvePasswordReset, createStaff, setUserActive, setUserPassword } from "@/lib/auth-service";
import { field, requireField } from "@/lib/form";
import { ownerWork } from "@/server/action";

export async function addStaff(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async (user) => {
    await createStaff(user.id, {
      name: field(form, "name"),
      email: field(form, "email"),
      password: field(form, "password"),
    });
    redirect("/team?notice=" + encodeURIComponent("Staff account created."));
  });
}

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async (user) => {
    await setUserPassword(user.id, requireField(form, "userId", "Person"), requireField(form, "password", "Password"));
    return { ok: true, message: "Password saved. They will need to sign in again." };
  });
}

export async function toggleActive(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async (user) => {
    const active = field(form, "active") === "1";
    await setUserActive(user.id, requireField(form, "userId", "Person"), active);
    redirect("/team?notice=" + encodeURIComponent(active ? "Sign-in turned on." : "Sign-in turned off."));
  });
}

export async function approveReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  return ownerWork(async (user) => {
    const token = await approvePasswordReset(user.id, requireField(form, "resetId", "Request"));
    return {
      ok: true,
      message: "Read this code once. It works for one hour, then it stops.",
      link: token,
    };
  });
}
