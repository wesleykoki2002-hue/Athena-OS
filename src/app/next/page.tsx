import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Clock,
  Crown,
  Rocket,
  Sparkles,
  Target,
  Zap
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type NextStep = {
  project_key: string;
  project_name: string;
  project_status: string;
  project_priority: string;
  project_progress: number;
  project_remaining_hours: number;
  closest_to_launch: boolean;
  revenue_ready: boolean;
  module_key: string;
  module_name: string;
  module_description: string;
  module_status: string;
  module_priority: string;
  module_progress: number;
  module_remaining_hours: number;
  reusable: boolean;
  module_notes: string | null;
  next_step_score: number;
  reason_category: string;
  recommended_action: string;
  effort_size: string;
  project_notes: string | null;
};

type ProjectOption = {
  project_key: string;
  name: string;
};

type NextStepsPageProps = {
  searchParams: Promise<{
    project_key?: string | string[];
  }>;
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
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

function reasonTone(reason: string) {
  if (reason === "Launch blocker") return "bg-black text-white";
  if (reason === "Critical build step") return "bg-black/80 text-white";
  if (reason === "Reusable system opportunity") return "bg-black/10 text-black";
  return "bg-black/5 text-black/60";
}

function startBuildHref(
  step: Pick<NextStep, "project_key" | "module_key">
) {
  const params = new URLSearchParams({
    project_key: step.project_key,
    module_key: step.module_key
  });

  return `/start-build?${params.toString()}`;
}

export default async function NextStepsPage({
  searchParams
}: NextStepsPageProps) {
  const supabase = createAthenaCoreClient();
  const query = await searchParams;

  const requestedProjectKey =
    firstSearchValue(query.project_key)?.trim() || "";

  const { data: projects, error: projectsError } = await supabase
    .from("athena_projects")
    .select("project_key, name")
    .order("name", { ascending: true })
    .returns<ProjectOption[]>();

  const projectOptions = projects || [];

  const selectedProject =
    projectOptions.find(
      (project) => project.project_key === requestedProjectKey
    ) || null;

  const sourceView = selectedProject
    ? "athena_cto_next_step_candidates"
    : "athena_cto_top_next_steps";

  let stepsQuery = supabase
    .from(sourceView)
    .select("*");

  if (selectedProject) {
    stepsQuery = stepsQuery.eq(
      "project_key",
      selectedProject.project_key
    );
  }

  const { data: steps, error: stepsError } = await stepsQuery
    .order("next_step_score", { ascending: false })
    .order("module_priority", { ascending: true })
    .order("module_remaining_hours", { ascending: true })
    .order("project_key", { ascending: true })
    .order("module_key", { ascending: true })
    .limit(12)
    .returns<NextStep[]>();

  const stepList = steps || [];
  const topStep = stepList[0];

  const invalidProjectFilter = Boolean(
    requestedProjectKey && !selectedProject
  );

  const loadFailed = Boolean(projectsError || stepsError);

  const launchBlockers = stepList.filter((step) => step.reason_category === "Launch blocker").length;
  const reusableOpportunities = stepList.filter((step) => step.reusable).length;
  const totalRemainingHours = stepList.reduce((sum, step) => {
    return sum + Number(step.module_remaining_hours || 0);
  }, 0);

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
                <Brain className="h-4 w-4" />
                Athena CTO
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                Next-Step Engine
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                Athena CTO ranks what you should build next using project priority, revenue potential, urgency, launch closeness, module status, and reusable value.
              </p>
            </div>

            {topStep ? (
              <Link
                href={startBuildHref(topStep)}
                className="block rounded-[2rem] bg-black p-6 text-white transition hover:-translate-y-0.5 hover:shadow-lg lg:min-w-96"
              >
                <p className="mb-2 text-sm text-white/55">Top recommendation</p>
                <h2 className="text-2xl font-semibold">{topStep.module_name}</h2>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {topStep.project_name} 窶・{topStep.reason_category}
                </p>
                <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 p-4">
                  <span className="text-sm text-white/60">Score</span>
                  <span className="text-2xl font-semibold">{topStep.next_step_score}</span>
                </div>
              </Link>
            ) : null}
          </div>
        </header>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm">
          <form
            action="/next"
            method="get"
            className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"
          >
            <div>
              <p className="text-sm font-medium text-black/45">
                Project filter
              </p>

              <h2 className="mt-1 text-2xl font-semibold">
                {selectedProject
                  ? selectedProject.name
                  : "Global recommendation ranking"}
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/55">
                {selectedProject
                  ? "Showing the highest-ranked candidates for this canonical project."
                  : "Showing the highest-ranked candidates across all canonical projects."}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                name="project_key"
                defaultValue={selectedProject?.project_key || ""}
                className="min-w-72 rounded-2xl border border-black/15 bg-[#fbfaf7] px-4 py-3 text-sm font-medium outline-none transition focus:border-black"
              >
                <option value="">All canonical projects</option>

                {projectOptions.map((project) => (
                  <option
                    key={project.project_key}
                    value={project.project_key}
                  >
                    {project.name}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
              >
                Apply filter
              </button>

              {selectedProject ? (
                <Link
                  href="/next"
                  className="rounded-2xl border border-black/15 px-5 py-3 text-center text-sm font-medium transition hover:bg-black/5"
                >
                  Show global
                </Link>
              ) : null}
            </div>
          </form>

          {invalidProjectFilter ? (
            <p className="mt-4 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black/60">
              The requested project key is not in the canonical project registry.
              The global ranking is shown instead.
            </p>
          ) : null}

          {loadFailed ? (
            <p className="mt-4 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black/60">
              Athena CTO could not load all project-filter data.
            </p>
          ) : null}
        </section>
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Target className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Next steps</p>
            <p className="mt-2 text-3xl font-semibold">{stepList.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Rocket className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Launch blockers</p>
            <p className="mt-2 text-3xl font-semibold">{launchBlockers}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Zap className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Reusable opportunities</p>
            <p className="mt-2 text-3xl font-semibold">{reusableOpportunities}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Hours in list</p>
            <p className="mt-2 text-3xl font-semibold">{Math.round(totalRemainingHours)}</p>
          </div>
        </div>

        {topStep ? (
          <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-black/45">Do this first</p>
                <h2 className="text-2xl font-semibold">{topStep.recommended_action}</h2>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-black/35">
                  Why
                </p>
                <p className="leading-7 text-black/70">{topStep.reason_category}</p>
              </div>

              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-black/35">
                  Effort
                </p>
                <p className="leading-7 text-black/70">
                  {topStep.effort_size} 窶・about {Math.round(topStep.module_remaining_hours)}h left
                </p>
              </div>

              <div className="rounded-[2rem] bg-[#f5f1ea] p-6">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-black/35">
                  Project
                </p>
                <Link
                  href={`/projects/${topStep.project_key}`}
                  className="inline-flex items-center gap-2 font-semibold transition hover:opacity-70"
                >
                  {topStep.project_name}
                  <Sparkles className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <p className="mt-6 rounded-[2rem] border border-black/10 p-6 leading-7 text-black/65">
              {topStep.module_description}
            </p>

            <Link
              href={startBuildHref(topStep)}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
            >
              Start this recommended build
              <Sparkles className="h-4 w-4" />
            </Link>
          </section>
        ) : null}

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-black/45">Ranked by Athena CTO</p>
              <h2 className="text-3xl font-semibold">
                {selectedProject
                  ? `${selectedProject.name} build queue`
                  : "Recommended build queue"}
              </h2>
            </div>
            <p className="text-sm text-black/45">
              Higher score means higher leverage.
            </p>
          </div>

          {stepList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No next steps found</p>
              <p className="mt-2 text-sm text-black/55">
                Add project modules below 100% progress to generate next-step candidates.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {stepList.map((step, index) => (
                <article
                  key={`${step.project_key}-${step.module_key}`}
                  className="group relative cursor-pointer rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Link
                    href={startBuildHref(step)}
                    aria-label={`Start ${step.module_name} for ${step.project_name}`}
                    className="absolute inset-0 z-0 rounded-[2rem] focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                  />

                  <div className="pointer-events-none relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                    <div className="max-w-3xl">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                          #{index + 1}
                        </span>

                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${reasonTone(step.reason_category)}`}>
                          {step.reason_category}
                        </span>

                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                          {step.effort_size}
                        </span>

                        {step.reusable ? (
                          <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                            reusable
                          </span>
                        ) : null}
                      </div>

                      <h3 className="text-2xl font-semibold">{step.module_name}</h3>

                      <Link
                        href={`/projects/${step.project_key}`}
                        className="pointer-events-auto mt-2 inline-flex items-center gap-2 text-sm font-medium text-black/55 transition hover:text-black"
                      >
                        {step.project_name}
                        <Sparkles className="h-4 w-4" />
                      </Link>

                      <p className="mt-4 text-sm leading-6 text-black/60">
                        {step.module_description}
                      </p>

                      {step.module_notes ? (
                        <p className="mt-4 rounded-3xl bg-white p-4 text-sm leading-6 text-black/55">
                          {step.module_notes}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-3xl bg-white p-5 lg:min-w-64">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-sm text-black/45">Next-step score</span>
                        <span className="text-2xl font-semibold">{step.next_step_score}</span>
                      </div>

                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="text-black/45">Module progress</span>
                        <span className="font-semibold">{step.module_progress}%</span>
                      </div>

                      <ProgressBar value={step.module_progress} />

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-[#f5f1ea] p-3">
                          <p className="text-black/45">Left</p>
                          <p className="mt-1 font-semibold">{Math.round(step.module_remaining_hours)}h</p>
                        </div>

                        <div className="rounded-2xl bg-[#f5f1ea] p-3">
                          <p className="text-black/45">Priority</p>
                          <p className="mt-1 font-semibold">{step.module_priority}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena CTO Next-Step Engine v1
        </footer>
      </section>
    </main>
  );
}