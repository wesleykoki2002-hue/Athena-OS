import Link from "next/link";
import { ArrowLeft, Brain, Sparkles } from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { updateAthenaProject } from "@/app/projects/edit-actions";

type EditProjectPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string | null;
  short_name: string | null;
  status: string | null;
  priority: string | null;
  progress_percent: number | null;
  estimated_total_hours: number | null;
  hours_spent: number | null;
  estimated_remaining_hours: number | null;
  business_value_score: number | null;
  technical_complexity_score: number | null;
  revenue_potential_score: number | null;
  urgency_score: number | null;
  closest_to_launch: boolean | null;
  revenue_ready: boolean | null;
  blocked: boolean | null;
  blocker_summary: string | null;
  notes: string | null;
};

function NumberField({
  name,
  label,
  defaultValue
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-black/70">{label}</label>
      <input
        name={name}
        type="number"
        step="0.25"
        defaultValue={defaultValue ?? 0}
        className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
      />
    </div>
  );
}

export default async function EditProjectPage({ params, searchParams }: EditProjectPageProps) {
  const { projectKey } = await params;
  const query = await searchParams;

  const supabase = createAthenaCoreClient();

  const { data } = await supabase
    .from("athena_projects")
    .select("*")
    .eq("project_key", projectKey)
    .maybeSingle<Project>();

  const project: Project = data || {
    project_key: projectKey,
    name: projectKey,
    short_name: projectKey,
    status: "working",
    priority: "P1",
    progress_percent: 0,
    estimated_total_hours: 0,
    hours_spent: 0,
    estimated_remaining_hours: 0,
    business_value_score: 5,
    technical_complexity_score: 5,
    revenue_potential_score: 5,
    urgency_score: 5,
    closest_to_launch: false,
    revenue_ready: false,
    blocked: false,
    blocker_summary: null,
    notes: "Project did not load from Supabase. You can still test the route."
  };

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link
            href={`/projects/${project.project_key}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Brain className="h-4 w-4" />
            Athena Project Update
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Edit {project.name}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Update status, progress, hours, scores, launch readiness, and Athena CTO notes.
          </p>
        </header>

        {!data ? (
          <div className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            The route is working, but this project was not loaded from Supabase. Save may fail if the project key does not exist.
          </div>
        ) : null}

        {query.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        <form action={updateAthenaProject} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <input type="hidden" name="project_key" value={project.project_key} />

          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">Project name</label>
              <input
                name="name"
                defaultValue={project.name ?? ""}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">Short name</label>
              <input
                name="short_name"
                defaultValue={project.short_name ?? ""}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">Status</label>
              <select
                name="status"
                defaultValue={project.status ?? "working"}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="planned">planned</option>
                <option value="building">building</option>
                <option value="active">active</option>
                <option value="working">working</option>
                <option value="partial">partial</option>
                <option value="prototype">prototype</option>
                <option value="near_launch">near_launch</option>
                <option value="future">future</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">Priority</label>
              <select
                name="priority"
                defaultValue={project.priority ?? "P1"}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="P0">P0 — Critical</option>
                <option value="P1">P1 — High</option>
                <option value="P2">P2 — Medium</option>
                <option value="P3">P3 — Low</option>
              </select>
            </div>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <NumberField name="progress_percent" label="Progress %" defaultValue={project.progress_percent} />
            <NumberField name="estimated_total_hours" label="Estimated total hours" defaultValue={project.estimated_total_hours} />
            <NumberField name="hours_spent" label="Hours spent" defaultValue={project.hours_spent} />
            <NumberField name="estimated_remaining_hours" label="Remaining hours" defaultValue={project.estimated_remaining_hours} />
            <NumberField name="business_value_score" label="Business value score" defaultValue={project.business_value_score} />
            <NumberField name="technical_complexity_score" label="Complexity score" defaultValue={project.technical_complexity_score} />
            <NumberField name="revenue_potential_score" label="Revenue potential score" defaultValue={project.revenue_potential_score} />
            <NumberField name="urgency_score" label="Urgency score" defaultValue={project.urgency_score} />
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <label className="flex items-center gap-3 rounded-3xl bg-[#f5f1ea] p-5">
              <input name="closest_to_launch" type="checkbox" defaultChecked={Boolean(project.closest_to_launch)} />
              <span className="text-sm font-medium">Closest to launch</span>
            </label>

            <label className="flex items-center gap-3 rounded-3xl bg-[#f5f1ea] p-5">
              <input name="revenue_ready" type="checkbox" defaultChecked={Boolean(project.revenue_ready)} />
              <span className="text-sm font-medium">Revenue ready</span>
            </label>

            <label className="flex items-center gap-3 rounded-3xl bg-[#f5f1ea] p-5">
              <input name="blocked" type="checkbox" defaultChecked={Boolean(project.blocked)} />
              <span className="text-sm font-medium">Blocked</span>
            </label>
          </div>

          <div className="mb-8 grid gap-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">Blocker summary</label>
              <textarea
                name="blocker_summary"
                rows={3}
                defaultValue={project.blocker_summary ?? ""}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">Athena CTO notes</label>
              <textarea
                name="notes"
                rows={5}
                defaultValue={project.notes ?? ""}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <Sparkles className="h-4 w-4" />
            Save Project Update
          </button>
        </form>
      </section>
    </main>
  );
}