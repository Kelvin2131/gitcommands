"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-4">
      <div className="card text-center">
        <h1 className="text-3xl font-semibold">The desk hit a problem</h1>
        <p className="mt-2 text-stone-700">Nothing was changed that we can confirm. Try the page again.</p>
        <button className="btn mt-4" type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
