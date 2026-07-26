import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Brain,
  Clock,
  Layers3,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import {
  archiveAthenaProjectModule,
  deleteAthenaProjectModule,
  updateAthenaProjectModule
} from "@/app/projects/module-actions";

type ModulesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
};

type ProjectModule = {
  project_key: string;
  module_key: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  progress_percent: number;
  estimated_remaining_hours: number;
  reusable: boolean;
  notes: string | null;
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-black/10">
      <div
        className="h-full rounded-full bg-black"
        style={{ width: `${Math.min(Math.max(value || 0, 0), 100)}%` }}
      />
    </div>
  );
}

export default async function ProjectModulesPage({ params, searchParams }: ModulesPageProps) {
  const { projectKey } = await params;
  const query = await searchParams;

  const supabase = createAthenaCoreClient();

  const { data: project } = await supabase
    .from("athena_projects")
    .select("project_key, name")
    .eq("project_key", projectKey)
    .maybeSingle<Project>();

  const { data: modules } = await supabase
    .from("athena_project_modules")
    .select("*")
    .eq("project_key", projectKey)
    .order("priority", { ascending: true })
    .order("estimated_remaining_hours", { ascending: false })
    .returns<ProjectModule[]>();

  const moduleList = modules || [];
  const activeModules = moduleList.filter((moduleItem) => moduleItem.status !== "archived");
  const archivedModules = moduleList.filter((moduleItem) => moduleItem.status === "archived");
  const projectName = project?.name || projectKey;

  const totalRemainingHours = activeModules.reduce((sum, moduleItem) => {
    return sum + Number(moduleItem.estimated_remaining_hours || 0);
  }, 0);

  const averageProgress =
    activeModules.length > 0
      ? Math.round(
          activeModules.reduce((sum, moduleItem) => {
            return sum + Number(moduleItem.progress_percent || 0);
          }, 0) / activeModules.length
        )
      : 0;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href={`/projects/${projectKey}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </Link>

          <Link
            href="/next"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Brain className="h-4 w-4" />
            CTO Next Steps
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Layers3 className="h-4 w-4" />
            Project Module Control
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            {projectName} Modules
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Update, archive, or delete modules. Active modules control project progress and estimated remaining hours.
          </p>

          <Link
            href={`/projects/${projectKey}/modules/new`}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <Sparkles className="h-4 w-4" />
            Add Module
          </Link>
        </header>

        {query.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        {query.success ? (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {query.success}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Layers3 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Active modules</p>
            <p className="mt-2 text-3xl font-semibold">{activeModules.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Sparkles className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Average progress</p>
            <p className="mt-2 text-3xl font-semibold">{averageProgress}%</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Active remaining hours</p>
            <p className="mt-2 text-3xl font-semibold">{Math.round(totalRemainingHours)}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Archive className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Archived</p>
            <p className="mt-2 text-3xl font-semibold">{archivedModules.length}</p>
          </div>
        </div>

        {moduleList.length === 0 ? (
          <section className="rounded-[2.5rem] border border-dashed border-black/15 bg-white p-8 text-center shadow-sm">
            <p className="text-xl font-semibold">No modules found</p>
            <p className="mt-2 text-sm text-black/55">
              This project has no records in athena_project_modules yet.
            </p>
          </section>
        ) : (
          <section className="grid gap-5">
            {moduleList.map((moduleItem) => (
              <form
                key={moduleItem.module_key}
                action={updateAthenaProjectModule}
                className={`rounded-[2.5rem] border p-6 shadow-sm ${
                  moduleItem.status === "archived"
                    ? "border-black/5 bg-white/55 opacity-70"
                    : "border-black/10 bg-white"
                }`}
              >
                <input type="hidden" name="project_key" value={projectKey} />
                <input type="hidden" name="module_key" value={moduleItem.module_key} />

                <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                        {moduleItem.module_key}
                      </span>

                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {moduleItem.priority}
                      </span>

                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {moduleItem.status}
                      </span>

                      {moduleItem.reusable ? (
                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                          reusable
                        </span>
                      ) : null}
                    </div>

                    <h2 className="text-2xl font-semibold">{moduleItem.name}</h2>

                    <div className="mt-4 max-w-xl">
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-black/45">Progress</span>
                        <span className="font-medium">{moduleItem.progress_percent}%</span>
                      </div>
                      <ProgressBar value={moduleItem.progress_percent} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                    >
                      <Save className="h-4 w-4" />
                      Save
                    </button>

                    <button
                      type="submit"
                      formAction={archiveAthenaProjectModule}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-[#f5f1ea]"
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-black/70">
                      Module name
                    </label>
                    <input
                      name="name"
                      defaultValue={moduleItem.name}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-black/70">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={moduleItem.status}
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
                      defaultValue={moduleItem.priority}
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
                      step="1"
                      defaultValue={moduleItem.progress_percent}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-black/70">
                      Remaining hours
                    </label>
                    <input
                      name="estimated_remaining_hours"
                      type="number"
                      step="0.25"
                      defaultValue={moduleItem.estimated_remaining_hours}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-3xl bg-[#f5f1ea] p-5">
                    <input
                      name="reusable"
                      type="checkbox"
                      defaultChecked={moduleItem.reusable}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">Reusable module</span>
                  </label>
                </div>

                <div className="mt-4 grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-black/70">
                      Description
                    </label>
                    <textarea
                      name="description"
                      rows={3}
                      defaultValue={moduleItem.description ?? ""}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-black/70">
                      Athena CTO notes
                    </label>
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={moduleItem.notes ?? ""}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                    />
                  </div>

                  <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
                    <div className="mb-3 flex items-center gap-2 text-red-800">
                      <Trash2 className="h-5 w-5" />
                      <p className="font-semibold">Hard delete</p>
                    </div>

                    <p className="mb-3 text-sm leading-6 text-red-700">
                      To delete this module permanently, type the exact module key:
                      <span className="font-semibold"> {moduleItem.module_key}</span>
                    </p>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <input
                        name="delete_confirmation"
                        placeholder={moduleItem.module_key}
                        className="w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-500"
                      />

                      <button
                        type="submit"
                        formAction={deleteAthenaProjectModule}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            ))}
          </section>
        )}

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Project Module Control v2
        </footer>
      </section>
    </main>
  );
}