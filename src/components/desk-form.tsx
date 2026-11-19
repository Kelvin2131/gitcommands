"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action-state";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function DeskForm({
  action,
  children,
  submit,
  className,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submit: string;
  className?: string;
}) {
  const [state, run] = useActionState(action, null);
  return (
    <form action={run} className={className ?? "grid gap-3"}>
      {state?.ok === false ? (
        <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-bad">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p role="status" className="rounded-lg bg-lime-100 px-3 py-2 text-ok">
          {state.message}
        </p>
      ) : null}
      {state?.ok === true && state.link ? (
        <p className="break-all rounded-lg bg-amber-50 px-3 py-2 font-mono text-sm">
          Reset code: {state.link}
        </p>
      ) : null}
      {children}
      <Submit label={submit} />
    </form>
  );
}
