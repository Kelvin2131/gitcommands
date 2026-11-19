import Link from "next/link";
import { DeskForm } from "@/components/desk-form";
import { Field } from "@/components/ui";
import { completeReset, requestReset } from "@/server/public-actions";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const query = await searchParams;
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-4 py-10">
      <div className="w-full card grid gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">KAMO 3pl</p>
        <h1 className="text-3xl font-semibold">Reset password</h1>
        <p className="text-stone-700">
          Ask the owner to approve the request, then paste the one-time code they read to you. There is no email, so a stranger cannot reset a password from this page alone.
        </p>
        {query.token ? (
          <DeskForm action={completeReset} submit="Save password">
            <input type="hidden" name="token" value={query.token} />
            <Field label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters." />
          </DeskForm>
        ) : (
          <>
            <DeskForm action={requestReset} submit="Tell the owner">
              <Field label="Email" name="email" type="email" autoComplete="username" required />
            </DeskForm>
            <DeskForm action={completeReset} submit="Save password">
              <Field label="Reset code" name="token" required autoComplete="one-time-code" />
              <Field label="New password" name="password" type="password" autoComplete="new-password" required />
            </DeskForm>
          </>
        )}
        <Link href="/login" className="text-sm font-semibold text-accent">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
