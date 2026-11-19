import { DeskForm } from "@/components/desk-form";
import { Field, Notices, PageHeader, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { formatWhen, getTimeZone } from "@/lib/dates";
import { requireOwnerPage } from "@/lib/session";
import { addStaff, approveReset, changePassword, toggleActive } from "@/server/team-actions";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireOwnerPage();
  const query = await searchParams;
  const [users, resets] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.passwordReset.findMany({
      where: { status: "REQUESTED" },
      include: { user: true },
      orderBy: { requestedAt: "asc" },
    }),
  ]);
  const zone = getTimeZone();
  return (
    <>
      <PageHeader title="Team" detail="Staff can run the floor. Only you can change fees, invoices, and passwords." />
      <Notices notice={query.notice} />
      {resets.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-xl font-semibold">Reset requests</h2>
          {resets.map((reset) => (
            <DeskForm key={reset.id} action={approveReset} submit="Show one-time code" className="card grid gap-3">
              <input type="hidden" name="resetId" value={reset.id} />
              <p>
                {reset.user.name} ({reset.user.email}) asked at {formatWhen(reset.requestedAt, zone)}.
              </p>
            </DeskForm>
          ))}
        </section>
      ) : null}
      <ul className="grid gap-3">
        {users.map((person) => (
          <li key={person.id} className="card grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{person.name}</p>
                <p className="text-sm text-stone-600">{person.email}</p>
              </div>
              <Pill>{person.active ? person.role : "Off"}</Pill>
            </div>
            <DeskForm action={changePassword} submit="Set password" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="userId" value={person.id} />
              <Field label="New password" name="password" type="password" autoComplete="new-password" required />
            </DeskForm>
            <DeskForm action={toggleActive} submit={person.active ? "Turn sign-in off" : "Turn sign-in on"}>
              <input type="hidden" name="userId" value={person.id} />
              <input type="hidden" name="active" value={person.active ? "0" : "1"} />
            </DeskForm>
          </li>
        ))}
      </ul>
      <section className="card grid gap-3">
        <h2 className="text-xl font-semibold">Add staff</h2>
        <DeskForm action={addStaff} submit="Create staff">
          <Field label="Name" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="Temporary password" name="password" type="password" required hint="Tell them in person. At least 10 characters." />
        </DeskForm>
      </section>
    </>
  );
}
