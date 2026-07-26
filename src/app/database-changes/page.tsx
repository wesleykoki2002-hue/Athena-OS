import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Database,
  FileCode2,
  ShieldAlert,
  TestTube2,
  Undo2
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type DatabaseChange = {
  id: string;
  change_key: string;
  change_name: string;
  project_key: string;
  module_key: string | null;
  build_session_title: string | null;
  change_type: string;
  object_type: string;
  object_name: string;
  status: string;
  description: string | null;
  rollback_notes: string | null;
  security_notes: string | null;
  test_notes: string | null;
  created_at: string;
  updated_at: string;
};

function statusBadge(status: string) {
  if (status === "working") return "bg-green-50 text-green-700 border-green-200";
  if (status === "planned") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "deprecated") return "bg-red-50 text-red-700 border-red-200";
  if (status === "needs_review") return "bg-yellow-50 text-yellow-800 border-yellow-200";
  return "bg-black/5 text-black/60 border-black/10";
}

function objectBadge(objectType: string) {
  if (objectType === "table") return "bg-black text-white";
  if (objectType === "view") return "bg-[#f5f1ea] text-black";
  if (objectType === "function") return "bg-blue-50 text-blue-700";
  if (objectType === "policy") return "bg-yellow-50 text-yellow-800";
  return "bg-black/5 text-black/60";
}

export default async function DatabaseChangesPage() {
  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase
    .from("athena_database_changes")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<DatabaseChange[]>();

  const changes = data || [];

  const totalChanges = changes.length;
  const workingChanges = changes.filter((change) => change.status === "working").length;
  const tables = changes.filter((change) => change.object_type === "table").length;
  const views = changes.filter((change) => change.object_type === "view").length;
  const needsSecurityReview = changes.filter((change) =>
    (change.security_notes || "").toLowerCase().includes("development-open") ||
    (change.security_notes || "").toLowerCase().includes("production")
  ).length;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Athena OS
          </Link>

          <Link
            href="/qa"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <TestTube2 className="h-4 w-4" />
            QA Center
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Database className="h-4 w-4" />
            Athena Database Registry
          </div>

          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
              Database Changes
            </h1>

            <Link
              href="/database-changes/new"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
            >
              <Database className="h-4 w-4" />
              New DB Change
            </Link>
          </div>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Named record of every important database change. This keeps tables, views, functions, policies, rollback notes, security notes, and test notes searchable instead of hidden inside plain build-log text.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Database changes read error: {error.message}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-5">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Database className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Total changes</p>
            <p className="mt-2 text-3xl font-semibold">{totalChanges}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <FileCode2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Working</p>
            <p className="mt-2 text-3xl font-semibold">{workingChanges}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Database className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Tables</p>
            <p className="mt-2 text-3xl font-semibold">{tables}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Brain className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Views</p>
            <p className="mt-2 text-3xl font-semibold">{views}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ShieldAlert className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Security notes</p>
            <p className="mt-2 text-3xl font-semibold">{needsSecurityReview}</p>
          </div>
        </div>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Registry</p>
            <h2 className="text-3xl font-semibold">Named database changes</h2>
          </div>

          {changes.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No database changes registered yet</p>
              <p className="mt-2 text-sm text-black/55">
                Add records to public.athena_database_changes when creating tables, views, functions, policies, triggers, or important migrations.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {changes.map((change) => (
                <article
                  key={change.id}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(change.status)}`}>
                      {change.status}
                    </span>

                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${objectBadge(change.object_type)}`}>
                      {change.object_type}
                    </span>

                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {change.change_type}
                    </span>

                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {change.project_key}
                    </span>

                    {change.module_key ? (
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {change.module_key}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <h3 className="text-2xl font-semibold">{change.change_name}</h3>

                    <Link
                      href={`/database-changes/${change.change_key}/edit`}
                      className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/85"
                    >
                      Edit registry record
                    </Link>
                  </div>

                  <p className="mt-2 break-words font-mono text-sm text-black/55">
                    {change.object_name}
                  </p>

                  <p className="mt-1 break-words text-xs text-black/35">
                    {change.change_key}
                  </p>

                  {change.description ? (
                    <p className="mt-4 max-w-4xl leading-7 text-black/65">
                      {change.description}
                    </p>
                  ) : null}

                  <div className="mt-5 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-3xl bg-white p-5">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <Undo2 className="h-4 w-4" />
                        Rollback notes
                      </div>
                      <p className="text-sm leading-6 text-black/55">
                        {change.rollback_notes || "No rollback notes recorded."}
                      </p>
                    </div>

                    <div className="rounded-3xl bg-white p-5">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <ShieldAlert className="h-4 w-4" />
                        Security notes
                      </div>
                      <p className="text-sm leading-6 text-black/55">
                        {change.security_notes || "No security notes recorded."}
                      </p>
                    </div>

                    <div className="rounded-3xl bg-white p-5">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <TestTube2 className="h-4 w-4" />
                        Test notes
                      </div>
                      <p className="text-sm leading-6 text-black/55">
                        {change.test_notes || "No test notes recorded."}
                      </p>
                    </div>
                  </div>

                  {change.build_session_title ? (
                    <p className="mt-5 text-sm text-black/40">
                      Build session: {change.build_session_title}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Database Changes Registry v1
        </footer>
      </section>
    </main>
  );
}