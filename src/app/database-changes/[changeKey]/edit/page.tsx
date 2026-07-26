import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Save,
  ShieldAlert,
  TestTube2
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { saveDatabaseChange } from "@/app/database-changes/actions";

type EditDatabaseChangePageProps = {
  params: Promise<{
    changeKey: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  priority: string;
  status: string;
};

type DatabaseChange = {
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
};

export default async function EditDatabaseChangePage({
  params,
  searchParams
}: EditDatabaseChangePageProps) {
  const { changeKey } = await params;
  const query = await searchParams;

  const supabase = createAthenaCoreClient();

  const { data: change, error } = await supabase
    .from("athena_database_changes")
    .select("*")
    .eq("change_key", changeKey)
    .maybeSingle<DatabaseChange>();

  const { data: projects } = await supabase
    .from("athena_projects")
    .select("project_key, name, priority, status")
    .order("priority", { ascending: true })
    .order("name", { ascending: true })
    .returns<Project[]>();

  const projectOptions = projects || [];

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/database-changes"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Database Changes
          </Link>

          <Link
            href="/database-map"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Database className="h-4 w-4" />
            Database Map
          </Link>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Database change read error: {error.message}
          </div>
        ) : null}

        {!change ? (
          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 text-center shadow-sm">
            <h1 className="text-3xl font-semibold">Database change not found</h1>
            <p className="mt-3 text-black/55">
              No registry record was found for this change key.
            </p>
          </section>
        ) : (
          <>
            <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                <Database className="h-4 w-4" />
                Edit Database Change
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                {change.change_name}
              </h1>

              <p className="mt-5 max-w-3xl break-words font-mono text-sm text-black/45">
                {change.change_key}
              </p>
            </header>

            {query.error ? (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {query.error}
              </div>
            ) : null}

            <form action={saveDatabaseChange} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-8 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Change name
                  </label>
                  <input
                    name="change_name"
                    required
                    defaultValue={change.change_name}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Change key
                  </label>
                  <input
                    name="change_key"
                    readOnly
                    defaultValue={change.change_key}
                    className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 font-mono text-sm text-black/60 outline-none"
                  />
                  <p className="mt-1 text-xs text-black/35">
                    Locked to prevent accidental duplicate registry records.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Project
                  </label>
                  <select
                    name="project_key"
                    required
                    defaultValue={change.project_key}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                  >
                    {projectOptions.map((project) => (
                      <option key={project.project_key} value={project.project_key}>
                        {project.name} — {project.priority} — {project.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Module key
                  </label>
                  <input
                    name="module_key"
                    defaultValue={change.module_key || ""}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Build session title
                  </label>
                  <input
                    name="build_session_title"
                    defaultValue={change.build_session_title || ""}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Status
                  </label>
                  <select
                    name="status"
                    required
                    defaultValue={change.status}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                  >
                    <option value="planned">planned</option>
                    <option value="working">working</option>
                    <option value="needs_review">needs_review</option>
                    <option value="deprecated">deprecated</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Change type
                  </label>
                  <select
                    name="change_type"
                    required
                    defaultValue={change.change_type}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                  >
                    <option value="create_table">create_table</option>
                    <option value="alter_table">alter_table</option>
                    <option value="create_view">create_view</option>
                    <option value="replace_view">replace_view</option>
                    <option value="create_function">create_function</option>
                    <option value="replace_function">replace_function</option>
                    <option value="create_policy">create_policy</option>
                    <option value="alter_policy">alter_policy</option>
                    <option value="create_trigger">create_trigger</option>
                    <option value="schema_change">schema_change</option>
                    <option value="data_seed">data_seed</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Object type
                  </label>
                  <select
                    name="object_type"
                    required
                    defaultValue={change.object_type}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                  >
                    <option value="table">table</option>
                    <option value="view">view</option>
                    <option value="function">function</option>
                    <option value="policy">policy</option>
                    <option value="trigger">trigger</option>
                    <option value="column">column</option>
                    <option value="seed_data">seed_data</option>
                    <option value="other">other</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Object name
                  </label>
                  <input
                    name="object_name"
                    required
                    defaultValue={change.object_name}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 font-mono text-sm outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="mb-8 grid gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={4}
                    defaultValue={change.description || ""}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Rollback notes
                  </label>
                  <textarea
                    name="rollback_notes"
                    rows={3}
                    defaultValue={change.rollback_notes || ""}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Security notes
                  </label>
                  <textarea
                    name="security_notes"
                    rows={3}
                    defaultValue={change.security_notes || ""}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">
                    Test notes
                  </label>
                  <textarea
                    name="test_notes"
                    rows={3}
                    defaultValue={change.test_notes || ""}
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="mb-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl bg-[#f5f1ea] p-5">
                  <Database className="mb-3 h-5 w-5" />
                  <p className="text-sm font-medium">Named object memory</p>
                  <p className="mt-2 text-sm leading-6 text-black/55">
                    Keep the object description accurate as Athena changes.
                  </p>
                </div>

                <div className="rounded-3xl bg-[#f5f1ea] p-5">
                  <ShieldAlert className="mb-3 h-5 w-5" />
                  <p className="text-sm font-medium">Security notes</p>
                  <p className="mt-2 text-sm leading-6 text-black/55">
                    Update RLS and production hardening notes whenever access changes.
                  </p>
                </div>

                <div className="rounded-3xl bg-[#f5f1ea] p-5">
                  <TestTube2 className="mb-3 h-5 w-5" />
                  <p className="text-sm font-medium">Test notes</p>
                  <p className="mt-2 text-sm leading-6 text-black/55">
                    Record how the change was verified.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
              >
                <Save className="h-4 w-4" />
                Save Database Change
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}