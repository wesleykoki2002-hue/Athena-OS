import { LockKeyhole } from "lucide-react";
import { operatorLogin } from "./actions";

type OperatorLoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function OperatorLoginPage({
  searchParams
}: OperatorLoginPageProps) {
  const query = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f1ea] px-6 py-10 text-[#171717]">
      <section className="w-full max-w-xl rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
          <LockKeyhole className="h-4 w-4" />
          Athena OS Operator Access
        </div>

        <h1 className="text-4xl font-semibold tracking-tight">
          Unlock Athena OS
        </h1>

        <p className="mt-4 text-sm leading-6 text-black/55">
          Enter the private operator key to access Athena OS control pages.
        </p>

        {query.error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        <form action={operatorLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-black/70">
              Operator key
            </label>
            <input
              name="operator_key"
              type="password"
              required
              autoComplete="off"
              className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            Unlock Athena OS
          </button>
        </form>
      </section>
    </main>
  );
}