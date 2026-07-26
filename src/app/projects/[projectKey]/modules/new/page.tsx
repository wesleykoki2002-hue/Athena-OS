import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Layers3,
  PlusCircle,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { createAthenaProjectModule } from "@/app/projects/module-actions";

type NewModulePageProps = {
  params: Promise<{
    projectKey: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  estimated_remaining_hours: number | null;
  progress_percent: number | null;
};

export default async function NewProjectModulePage({ params, searchParams }: NewModulePageProps) {
  const { projectKey } = await params;
  const query = await searchParams;

  const supabase = createAthenaCoreClient();

  const { data: project } = await supabase
    .from("athena_projects")
    .select("project_key, name, estimated_remaining_hours, progress_percent")
    .eq("project_key", projectKey)
    .maybeSingle<Project>();

  const projectName = project?.name || projectKey;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href={`/projects/${projectKey}/modules`}
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to modules
          </Link>

          <Link
            href={`/projects/${projectKey}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Brain className="h-4 w-4" />
            Back to project
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <PlusCircle className="h-4 w-4" />
            Module Creation UI
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Add Module to {projectName}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Create a new project module. After saving, Athena will update project remaining hours, project progress, and the Daily Command Center automatically.
          </p>
        </header>

        {project ? (
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-sm text-black/45">Current project remaining hours</p>
              <p className="mt-2 text-3xl font-semibold">
                {project.estimated_remaining_hours ?? 0}
              </p>
              <p className="mt-2 text-sm text-black/45">
                This comes from athena_projects, not a hardcoded value.
              </p>
            </div>

            <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-sm text-black/45">Current project progress</p>
              <p className="mt-2 text-3xl font-semibold">
                {project.progress_percent ?? 0}%
              </p>
              <p className="mt-2 text-sm text-black/45">
                This will recalculate after the new module is inserted.
              </p>
            </div>
          </div>
        ) : null}

        {query.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        <form action={createAthenaProjectModule} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <input type="hidden" name="project_key" value={projectKey} />

          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Module key
              </label>
              <input
                name="module_key"
                required
                placeholder="example: customer-feedback-engine"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                Use lowercase words. The system will normalize it.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Module name
              </label>
              <input
                name="name"
                required
                placeholder="Example: Customer Feedback Engine"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Status
              </label>
              <select
                name="status"
                defaultValue="planned"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="planned">planned</option>
                <option value="partial">partial</option>
                <option value="building">building</option>
                <option value="working">working</option>
                <option value="active">active</option>
                <option value="complete">complete</option>
                <option value="blocked">blocked</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Priority
              </label>
              <select
                name="priority"
                defaultValue="P2"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="P0">P0 — Critical</option>
                <option value="P1">P1 — High</option>
                <option value="P2">P2 — Medium</option>
                <option value="P3">P3 — Low</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Progress %
              </label>
              <input
                name="progress_percent"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Example: 0"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Estimated remaining hours
              </label>
              <input
                name="estimated_remaining_hours"
                type="number"
                min="0"
                step="0.25"
                placeholder="Example: 12"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                This will be added to the project total by the database trigger.
              </p>
            </div>
          </div>

          <div className="mb-8 grid gap-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Description
              </label>
              <textarea
                name="description"
                rows={4}
                placeholder="What this module does and why it matters."
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Athena CTO notes
              </label>
              <textarea
                name="notes"
                rows={4}
                placeholder="Important technical notes, blockers, or reuse ideas."
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>
          </div>

          <label className="mb-8 flex items-center gap-3 rounded-3xl bg-[#f5f1ea] p-5">
            <input name="reusable" type="checkbox" className="h-4 w-4" />
            <span className="text-sm font-medium">
              This module may be reusable across other projects
            </span>
          </label>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <Layers3 className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Creates module</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Saves one new row in athena_project_modules.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <Sparkles className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Updates dashboard</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Project totals and Daily Command Center refresh after save.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <ShieldCheck className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Planning data only</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                This edits Athena Core planning records, not customer data.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <PlusCircle className="h-4 w-4" />
            Create Module
          </button>
        </form>
      </section>
    </main>
  );
}