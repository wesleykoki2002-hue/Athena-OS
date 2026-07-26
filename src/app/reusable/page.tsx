import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  Database,
  Layers3,
  Rocket,
  Sparkles
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type ReusableComponent = {
  component_key: string;
  name: string;
  description: string;
  source_project_key: string | null;
  component_type: string;
  status: string;
  reusable_in_projects: string[];
  estimated_hours_saved: number;
  notes: string | null;
};

export default async function ReusableComponentsPage() {
  const supabase = createAthenaCoreClient();

  const { data: components } = await supabase
    .from("athena_reusable_components")
    .select("*")
    .order("estimated_hours_saved", { ascending: false })
    .returns<ReusableComponent[]>();

  const componentList = components || [];

  const totalHoursSaved = componentList.reduce((sum, component) => {
    return sum + Number(component.estimated_hours_saved || 0);
  }, 0);

  const totalProjectsImpacted = new Set(
    componentList.flatMap((component) => component.reusable_in_projects || [])
  ).size;

  const componentTypes = new Set(componentList.map((component) => component.component_type)).size;

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
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                <Boxes className="h-4 w-4" />
                Athena Reuse Engine
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                Reusable Components
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                These are the systems, workflows, schemas, and patterns Athena CTO can reuse across your projects to save engineering time.
              </p>
            </div>

            <div className="rounded-[2rem] bg-[#f5f1ea] p-6 lg:min-w-80">
              <p className="text-sm text-black/50">Estimated hours saved</p>
              <p className="mt-2 text-5xl font-semibold">{Math.round(totalHoursSaved)}</p>
              <p className="mt-3 text-sm leading-6 text-black/55">
                This is Athena CTO&apos;s leverage: build once, reuse across many projects.
              </p>
            </div>
          </div>
        </header>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Boxes className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Components</p>
            <p className="mt-2 text-3xl font-semibold">{componentList.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Hours saved</p>
            <p className="mt-2 text-3xl font-semibold">{Math.round(totalHoursSaved)}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Rocket className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Projects impacted</p>
            <p className="mt-2 text-3xl font-semibold">{totalProjectsImpacted}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Code2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Component types</p>
            <p className="mt-2 text-3xl font-semibold">{componentTypes}</p>
          </div>
        </div>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-black/45">Athena CTO interpretation</p>
              <h2 className="text-2xl font-semibold">Why this matters</h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
              <Database className="mb-4 h-6 w-6" />
              <h3 className="font-semibold">Architecture reuse</h3>
              <p className="mt-3 text-sm leading-6 text-black/60">
                Auth, company workspaces, event timelines, and dashboards can be reused in future SaaS projects.
              </p>
            </div>

            <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
              <Layers3 className="mb-4 h-6 w-6" />
              <h3 className="font-semibold">Workflow reuse</h3>
              <p className="mt-3 text-sm leading-6 text-black/60">
                Importers, product research flows, AI briefings, and recommendation patterns can be copied across projects.
              </p>
            </div>

            <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
              <Sparkles className="mb-4 h-6 w-6" />
              <h3 className="font-semibold">Speed advantage</h3>
              <p className="mt-3 text-sm leading-6 text-black/60">
                Every reusable pattern lowers the time needed to launch BeautyDNA, Business OS, Shigoto Doko, KANJIDŌ, and future products.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-black/45">Reuse library</p>
              <h2 className="text-3xl font-semibold">Available components</h2>
            </div>
            <p className="text-sm text-black/45">
              Ordered by estimated engineering hours saved.
            </p>
          </div>

          {componentList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No reusable components registered yet</p>
              <p className="mt-2 text-sm text-black/55">
                Athena CTO will add reusable patterns here as you build more systems.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {componentList.map((component) => (
                <article
                  key={component.component_key}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold">{component.name}</h3>

                    <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                      {component.component_type}
                    </span>

                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {component.status}
                    </span>
                  </div>

                  <p className="mb-5 text-sm leading-6 text-black/60">
                    {component.description}
                  </p>

                  <div className="mb-5 rounded-3xl bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm text-black/45">Estimated hours saved</span>
                      <span className="font-semibold">
                        {Math.round(component.estimated_hours_saved)}h
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Source: {component.source_project_key || "Not assigned"}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-black/35">
                      Reusable in
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {(component.reusable_in_projects || []).map((projectKey) => (
                        <Link
                          key={projectKey}
                          href={`/projects/${projectKey}`}
                          className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/60 transition hover:bg-black hover:text-white"
                        >
                          {projectKey}
                        </Link>
                      ))}
                    </div>
                  </div>

                  {component.notes ? (
                    <p className="mt-5 rounded-3xl bg-white p-4 text-sm leading-6 text-black/60">
                      {component.notes}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena OS Reusable Components v1
        </footer>
      </section>
    </main>
  );
}