import Link from "next/link";
import {
  ArrowLeft,
  Database,
  PlusCircle,
  ShieldAlert,
  TestTube2
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { saveDatabaseChange } from "@/app/database-changes/actions";

type NewDatabaseChangePageProps = {
  searchParams: Promise<{
    error?: string;
    change_name?: string;
    change_key?: string;
    project_key?: string;
    module_key?: string;
    build_session_title?: string;
    change_type?: string;
    object_type?: string;
    object_name?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  priority: string;
  status: string;
};

export default async function NewDatabaseChangePage({ searchParams }: NewDatabaseChangePageProps) {
  const query = await searchParams;
  const supabase = createAthenaCoreClient();

  const defaultProjectKey = query.project_key || "athena-os";
  const defaultChangeType = query.change_type || "schema_change";
  const defaultObjectType = query.object_type || "table";

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

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Database className="h-4 w-4" />
            New Database Change
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Register database work
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Add a named database change so future you, Athena, or a developer can understand what exists in Supabase, why it exists, how to test it, and what security or rollback notes matter.
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
                defaultValue={query.change_name || ""}
                placeholder="Example: Create Athena QA Runs Table"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Change key
              </label>
              <input
                name="change_key"
                defaultValue={query.change_key || ""}
                placeholder="Optional. Auto-generated if blank."
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                Use stable kebab-case. If this already exists, the registry record will be updated.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Project
              </label>
              <select
                name="project_key"
                required
                defaultValue={defaultProjectKey}
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
                defaultValue={query.module_key || ""}
                placeholder="Example: qa-gate"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Build session title
              </label>
              <input
                name="build_session_title"
                defaultValue={query.build_session_title || ""}
                placeholder="Example: 0048 Database Change Creation UI"
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
                defaultValue="working"
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
                defaultValue={defaultChangeType}
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
                defaultValue={defaultObjectType}
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
                defaultValue={query.object_name || ""}
                placeholder="Example: public.athena_qa_runs or public.athena_qa_runs.build_session_title"
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
                placeholder="What was created or changed, and why does it exist?"
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
                placeholder="How would we safely undo this if needed?"
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
                placeholder="RLS, policies, exposure risks, production hardening notes."
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
                placeholder="What SQL, UI, QA run, or before/after check proved this worked?"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <Database className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Developer handoff</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Future developers can search by object name and understand why it exists.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <ShieldAlert className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Security memory</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                RLS and hardening risks are visible instead of hidden in old chat context.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <TestTube2 className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Testable changes</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Every important database change can include proof that it was tested.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <PlusCircle className="h-4 w-4" />
            Save Database Change
          </button>
        </form>
      </section>
    </main>
  );
}