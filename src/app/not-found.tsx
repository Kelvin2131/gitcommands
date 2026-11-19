import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-4">
      <div className="card text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">KAMO 3pl</p>
        <h1 className="mt-2 text-3xl font-semibold">That page is not on the desk</h1>
        <p className="mt-2 text-stone-700">The link may be old. Go back to today&apos;s work.</p>
        <Link href="/dashboard" className="btn mt-4">
          Today
        </Link>
      </div>
    </main>
  );
}
