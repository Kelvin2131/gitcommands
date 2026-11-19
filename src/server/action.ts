import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { toUserError } from "@/lib/errors";
import { assertOwner, requireUser, type SessionUser } from "@/lib/session";

function rethrowNext(error: unknown): void {
  unstable_rethrow(error);
}

export async function deskWork(fn: (user: SessionUser) => Promise<ActionState>): Promise<ActionState> {
  try {
    const user = await requireUser();
    return await fn(user);
  } catch (error) {
    rethrowNext(error);
    return { ok: false, error: toUserError(error) };
  }
}

export async function ownerWork(fn: (user: SessionUser) => Promise<ActionState>): Promise<ActionState> {
  return deskWork(async (user) => {
    assertOwner(user);
    return fn(user);
  });
}

export async function publicWork(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (error) {
    rethrowNext(error);
    return { ok: false, error: toUserError(error) };
  }
}
