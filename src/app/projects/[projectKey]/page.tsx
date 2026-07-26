import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  Crown,
  Database,
  Layers3,
  Rocket,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type ProjectDetailProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  short_name: string | null;
  category: string;
  project_type: string;
  status: string;
  priority: string;
  progress_percent: number;
  estimated_total_hours: number;
  hours_spent: number;
  estimated_remaining_hours: number;
  business_value_score: number;
  technical_complexity_score: number;
  revenue_potential_score: number;
  urgency_score: number;
  closest_to_launch: boolean;
  revenue_ready: boolean;
  definition: string;
  function_summary: string;
  build_summary: string;
  notes: string | null;
};

type ProjectModule = {
  module_key: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  progress_percent: number;
  estimated_hours: number;
  hours_spent: number;
  estimated_remaining_hours: number;
  reusable: boolean;
  reusable_notes: string | null;
};

type ReusableComponent = {
  component_key: string;
  name: string;
  description: string;
  component_type: string;
  status: string;
  estimated_hours_saved: number;
  reusable_in_projects: string[];
  notes: string | null;
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-black/10">
      <div
        className="h-full rounded-full bg-black"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

function priorityLabel(priority: string) {
  if (priority === "P0") return "Critical";
  if (priority === "P1") return "High";
  if (priority === "P2") return "Medium";
  return "Low";
}

export default async function ProjectDetailPage({ params }: ProjectDetailProps) {
  const { projectKey } = await params;

  const supabase = createAthenaCoreClient();

  const { data: project } = await supabase
    .from("athena_portfolio_snapshot")
    .select("*")
    .eq("project_key", projectKey)
    .maybeSingle<Project>();

  if (!project) {
    notFound();
  }

  const { data: modules } = await supabase
    .from("athena_project_modules")
    .select("*")
    .eq("project_key", project.project_key)
    .order("priority", { ascending: true })
    .order("progress_percent", { ascending: false })
    .returns<ProjectModule[]>();

  const { data: reusableComponents } = await supabase
    .from("athena_reusable_components")
    .select("*")
    .or(`source_project_key.eq.${project.project_key},reusable_in_projects.cs.{${project.project_key}}`)
    .order("estimated_hours_saved", { ascending: false })
    .returns<ReusableComponent[]>();

  const moduleList = modules || [];
  const reusableList = reusableComponents || [];

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Athena OS
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                  <Brain className="h-4 w-4" />
                  {project.priority} — {priorityLabel(project.priority)}
                </span>

                <span className="rounded-full bg-black/5 px-4 py-2 text-sm font-medium text-black/60">
                  {project.status}
                </span>

                {project.closest_to_launch ? (
                  <span className="rounded-full bg-black/10 px-4 py-2 text-sm font-medium">
                    closest to launch
                  </span>
                ) : null}

                {project.revenue_ready ? (
                  <span className="rounded-full bg-black/10 px-4 py-2 text-sm font-medium">
                    revenue ready
                  </span>
                ) : null}
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                {project.name}
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                {project.definition}
              </p>

            <Link
              href={`/projects/${project.project_key}/modules`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-[#f5f1ea]"
            >
              <Layers3 className="h-4 w-4" />
              Edit Modules
            </Link><Link
              href={`/projects/${project.project_key}/edit`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
            >
              <Sparkles className="h-4 w-4" />
              Edit Project
            </Link>
            </div>

            <div className="rounded-[2rem] bg-[#f5f1ea] p-6 lg:min-w-80">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-black/50">Progress</span>
                <span className="text-2xl font-semibold">{project.progress_percent}%</span>
              </div>
              <ProgressBar value={project.progress_percent} />

              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs text-black/45">Total</p>
                  <p className="mt-1 font-semibold">{Math.round(project.estimated_total_hours)}h</p>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs text-black/45">Spent</p>
                  <p className="mt-1 font-semibold">{Math.round(project.hours_spent)}h</p>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs text-black/45">Left</p>
                  <p className="mt-1 font-semibold">{Math.round(project.estimated_remaining_hours)}h</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Crown className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Business value</p>
            <p className="mt-2 text-3xl font-semibold">{project.business_value_score}/10</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Code2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Complexity</p>
            <p className="mt-2 text-3xl font-semibold">{project.technical_complexity_score}/10</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Rocket className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Revenue potential</p>
            <p className="mt-2 text-3xl font-semibold">{project.revenue_potential_score}/10</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Urgency</p>
            <p className="mt-2 text-3xl font-semibold">{project.urgency_score}/10</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-black/45">Project architecture</p>
                <h2 className="text-2xl font-semibold">Function and build plan</h2>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-black/35">
                  Function
                </p>
                <p className="leading-7 text-black/70">{project.function_summary}</p>
              </div>

              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-black/35">
                  How it is being built
                </p>
                <p className="leading-7 text-black/70">{project.build_summary}</p>
              </div>

              {project.notes ? (
                <div className="rounded-[2rem] border border-black/10 p-6">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-black/35">
                    Athena CTO note
                  </p>
                  <p className="leading-7 text-black/70">{project.notes}</p>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-black/45">Athena CTO view</p>
                <h2 className="text-2xl font-semibold">What this project means</h2>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-3xl bg-[#f5f1ea] p-5">
                <p className="text-sm text-black/45">Category</p>
                <p className="mt-1 font-semibold">{project.category}</p>
              </div>

              <div className="rounded-3xl bg-[#f5f1ea] p-5">
                <p className="text-sm text-black/45">Project type</p>
                <p className="mt-1 font-semibold">{project.project_type}</p>
              </div>

              <div className="rounded-3xl bg-black p-5 text-white">
                <p className="mb-2 flex items-center gap-2 font-semibold">
                  <Sparkles className="h-5 w-5" />
                  Next interpretation
                </p>
                <p className="text-sm leading-6 text-white/70">
                  Athena CTO should use this page as the single project truth before deciding what to build next.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-black/45">Modules</p>
              <h2 className="text-2xl font-semibold">Project modules</h2>
            </div>
          </div>

          {moduleList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No modules registered yet</p>
              <p className="mt-2 text-sm text-black/55">
                Next we can seed modules for this project inside Athena CTO.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {moduleList.map((module) => (
                <article key={module.module_key} className="rounded-[2rem] bg-[#fbfaf7] p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{module.name}</h3>
                    <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                      {module.priority}
                    </span>
                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {module.status}
                    </span>
                  </div>

                  <p className="mb-4 text-sm leading-6 text-black/60">{module.description}</p>

                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="text-black/45">Progress</span>
                    <span className="font-semibold">{module.progress_percent}%</span>
                  </div>
                  <ProgressBar value={module.progress_percent} />

                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-black/50">
                    <span>{Math.round(module.estimated_remaining_hours)}h left</span>
                    {module.reusable ? <span>Reusable</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-black/45">Reuse engine</p>
              <h2 className="text-2xl font-semibold">Reusable components</h2>
            </div>
          </div>

          {reusableList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No reusable components linked yet</p>
              <p className="mt-2 text-sm text-black/55">
                Athena can link reusable systems from other projects later.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {reusableList.map((component) => (
                <article key={component.component_key} className="rounded-[2rem] bg-[#fbfaf7] p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{component.name}</h3>
                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {component.component_type}
                    </span>
                  </div>

                  <p className="mb-4 text-sm leading-6 text-black/60">
                    {component.description}
                  </p>

                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Saves about {Math.round(component.estimated_hours_saved)}h
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena OS Project Detail v1 — {project.project_key}
        </footer>
      </section>
    </main>
  );
}