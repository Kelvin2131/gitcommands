import Link from "next/link";
import { redirect } from "next/navigation";
import { Notices } from "@/components/ui";
import { DeskForm } from "@/components/desk-form";
import { Field } from "@/components/ui";
import { getSessionUser } from "@/lib/session";
import { login } from "@/server/public-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  if (await getSessionUser()) redirect("/dashboard");
  const query = await searchParams;
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-4 py-10">
      <div className="w-full">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">KAMO 3pl</p>
        <h1 className="mt-1 text-4xl font-semibold">Cratekeep</h1>
        <p className="mt-2 text-stone-700">The packing desk. Sign in to receive, pick, and ship.</p>
        <div className="card mt-6 grid gap-4">
          <Notices notice={query.notice} error={query.error} />
          <DeskForm action={login} submit="Sign in">
            <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
            <Field label="Password" name="password" type="password" autoComplete="current-password" required />
          </DeskForm>
          <Link href="/reset-password" className="text-sm font-semibold text-accent">
            Forgot password
          </Link>
        </div>
      </div>
    </main>
  );
}
