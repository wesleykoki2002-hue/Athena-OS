import Link from "next/link";
import {
  Boxes,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  Crown,
  LayoutDashboard,
  Rocket,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { regenerateDailyBriefing } from "@/app/actions";

type Project = {
  project_key: string;
  name: string;
  short_name: string | null;
  category: string;
  project_type: string;
  status: string;
  priority: string;
  progress_percent: number;
  estimated_remaining_hours: number;
  priority_score: number;
  closest_to_launch: boolean;
  revenue_ready: boolean;
  definition: string;
  function_summary: string;
  build_summary: string;
  notes: string | null;
};

type DailyCommandCenter = {
  briefing_date: string;
  greeting: string;
  yesterday_completed: string[];
  recommendation: string;
  today_priorities: string[];
  estimated_focus_hours: number;
  total_reusable_components: number;
  estimated_engineering_hours_saved: number;
  closest_product_key: string;
  closest_product_name: string;
  closest_product_progress: number;
  closest_product_remaining_hours: number;
  closest_product_notes: string | null;
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

export default async function Home() {
  const supabase = createAthenaCoreClient();

  const { data: daily } = await supabase
    .from("athena_daily_command_center_view")
    .select("*")
    .maybeSingle<DailyCommandCenter>();

  const { data: projects } = await supabase
    .from("athena_portfolio_snapshot")
    .select("*")
    .limit(20)
    .returns<Project[]>();

  const projectList = projects || [];

  const topProjects = projectList.slice(0, 6);
  const closestProject = projectList.find((project) => project.closest_to_launch);
  const totalRemainingHours = projectList.reduce((sum, project) => {
    return sum + Number(project.estimated_remaining_hours || 0);
  }, 0);

  const averageProgress =
    projectList.length > 0
      ? Math.round(
          projectList.reduce((sum, project) => sum + Number(project.progress_percent || 0), 0) /
            projectList.length
        )
      : 0;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                <Brain className="h-4 w-4" />
                Athena OS
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                Daily Command Center
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                {daily?.greeting || "Good morning, Wesley."} Athena OS is now the foundation that helps build, track, and manage your full project ecosystem.
              </p>



              <Link
                href="/logs"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-[#f5f1ea]"
              >
                <Code2 className="h-4 w-4" />
                Build Logs
              </Link><Link
                href="/update"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-[#f5f1ea]"
              >
                <Code2 className="h-4 w-4" />
                Record Update
              </Link><Link
                href="/next"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
              >
                <Rocket className="h-4 w-4" />
                CTO Next Step
              </Link><Link
                href="/reusable"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
              >
                <Boxes className="h-4 w-4" />
                Reusable Components
              </Link>
              <form action={regenerateDailyBriefing}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-[#f5f1ea]"
                >
                  <Sparkles className="h-4 w-4" />
                  Regenerate Daily Briefing
                </button>
              </form>
            </div>

            <div className="grid gap-3 rounded-[2rem] bg-[#f5f1ea] p-5 text-sm lg:min-w-80">
              <div className="flex items-center justify-between">
                <span className="text-black/50">Portfolio progress</span>
                <span className="font-semibold">{averageProgress}%</span>
              </div>
              <ProgressBar value={averageProgress} />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-black/50">Remaining hours</span>
                <span className="font-semibold">{Math.round(totalRemainingHours)}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <LayoutDashboard className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Projects tracked</p>
            <p className="mt-2 text-3xl font-semibold">{projectList.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Boxes className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Reusable components</p>
            <p className="mt-2 text-3xl font-semibold">
              {daily?.total_reusable_components || 43}
            </p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Focus hours today</p>
            <p className="mt-2 text-3xl font-semibold">
              {daily?.estimated_focus_hours || 6.5}
            </p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Code2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Hours saved</p>
            <p className="mt-2 text-3xl font-semibold">
              {daily?.estimated_engineering_hours_saved || 147}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-black/45">Athena recommendation</p>
                <h2 className="text-2xl font-semibold">Today&apos;s command briefing</h2>
              </div>
            </div>

            <div className="mb-6 rounded-[2rem] bg-[#f5f1ea] p-6">
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-black/35">
                Yesterday you completed
              </p>

              <div className="grid gap-3">
                {(daily?.yesterday_completed || [
                  "Sales CRM",
                  "Sales CRM shortcut",
                  "Lead status workflow"
                ]).map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6 rounded-[2rem] border border-black/10 p-6">
              <p className="mb-2 text-sm font-medium text-black/45">Closest product to launch</p>
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h3 className="text-3xl font-semibold">
                    {daily?.closest_product_name || closestProject?.name || "BeautyDNA"}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
                    {daily?.closest_product_notes ||
                      closestProject?.notes ||
                      "BeautyDNA is closest to launch because it already has product recommendations, Shopify connection, product roles, routine logic, and cart flow."}
                  </p>
                </div>

                <div className="rounded-3xl bg-black p-5 text-white md:min-w-44">
                  <p className="text-sm text-white/60">Progress</p>
                  <p className="mt-2 text-4xl font-semibold">
                    {daily?.closest_product_progress || closestProject?.progress_percent || 84}%
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] bg-black p-6 text-white">
              <div className="mb-4 flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-xl font-semibold">Today&apos;s recommendation</h3>
              </div>

              <p className="leading-7 text-white/75">
                {daily?.recommendation ||
                  "BeautyDNA is the closest product to launch. Finish Ingredient Intelligence, complete the Recommendation Explanation Engine, and import or approve remaining products."}
              </p>
            </div>
          </section>

          <aside className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
                <Rocket className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-black/45">Execution plan</p>
                <h2 className="text-2xl font-semibold">Today&apos;s priorities</h2>
              </div>
            </div>

            <div className="grid gap-3">
              {(daily?.today_priorities || [
                "BeautyDNA — Finish Ingredient Intelligence",
                "BeautyDNA — Complete Recommendation Explanation Engine",
                "Athena OS — Complete Project Registry v2"
              ]).map((priority, index) => (
                <div key={priority} className="rounded-3xl bg-[#f5f1ea] p-5">
                  <p className="mb-2 text-sm font-semibold text-black/40">0{index + 1}</p>
                  <p className="font-medium leading-6">{priority}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-black/10 p-5">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                <p className="font-semibold">Correct structure</p>
              </div>
              <p className="text-sm leading-6 text-black/60">
                Athena OS is the foundation. Athena CTO is the builder agent. Athena Business OS is one sellable product managed by Athena OS.
              </p>
            </div>
          </aside>
        </div>

        <section className="mt-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-black/45">Portfolio</p>
              <h2 className="text-3xl font-semibold">Projects managed by Athena CTO</h2>
            </div>
            <p className="text-sm text-black/45">
              Ordered by priority, value, urgency, and progress.
            </p>
          </div>

          <div className="grid gap-4">
            {topProjects.map((project) => (
              <Link
                key={project.project_key}
                href={`/projects/${project.project_key}`}
                className="block rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="max-w-3xl">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold">{project.name}</h3>
                      <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                        {project.priority} — {priorityLabel(project.priority)}
                      </span>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {project.status}
                      </span>
                      {project.closest_to_launch ? (
                        <span className="rounded-full bg-black/10 px-3 py-1 text-xs font-medium">
                          closest to launch
                        </span>
                      ) : null}
                    </div>

                    <p className="text-sm leading-6 text-black/60">{project.definition}</p>
                  </div>

                  <div className="rounded-3xl bg-white p-4 md:min-w-48">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="text-black/45">Progress</span>
                      <span className="font-semibold">{project.progress_percent}%</span>
                    </div>
                    <ProgressBar value={project.progress_percent} />
                    <p className="mt-3 text-sm text-black/50">
                      {Math.round(project.estimated_remaining_hours)}h remaining
                    </p>
                  </div>

                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium">
                    View project detail
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">System safety</p>
            <h2 className="text-3xl font-semibold">Athena Control & QA</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">
              Use these pages to double-check features, database changes, live Supabase objects, reusable SQL diagnostics, feature completion packets, and completion history before marking work as complete.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Link
              href="/qa"
              className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
            >
              <p className="text-sm font-medium text-black/45">QA Gate</p>
              <h3 className="mt-2 text-2xl font-semibold">QA Center</h3>
              <p className="mt-3 text-sm leading-6 text-black/55">
                Create and review QA runs before marking features as working.
              </p>
            </Link>

            <a
              href="/qa-prefill-templates"
              className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
            >
              <p className="text-sm font-medium text-black/45">QA automation</p>
              <h3 className="mt-2 text-2xl font-semibold">QA Templates</h3>
              <p className="mt-3 text-sm leading-6 text-black/55">
                View feature-type templates used to prefill QA checks for different kinds of features.
              </p>
            </a>

            <a
              href="/complete-feature"
              className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
            >
              <p className="text-sm font-medium text-black/45">Close feature</p>
              <h3 className="mt-2 text-2xl font-semibold">Complete Feature</h3>
              <p className="mt-3 text-sm leading-6 text-black/55">
                Generate QA, CTO update, and memory-check packets from one screen.
              </p>
            </a>

            <a
              href="/completion-history"
              className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
            >
              <p className="text-sm font-medium text-black/45">Completed work</p>
              <h3 className="mt-2 text-2xl font-semibold">History</h3>
              <p className="mt-3 text-sm leading-6 text-black/55">
                Review completed features, CTO recording state, memory closure, and duplicate-guard history.
              </p>
            </a>

            <a
              href="/database-changes"
              className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
            >
              <p className="text-sm font-medium text-black/45">Database registry</p>
              <h3 className="mt-2 text-2xl font-semibold">Database Changes</h3>
              <p className="mt-3 text-sm leading-6 text-black/55">
                See named tables, views, functions, policies, rollback notes, security notes, and test notes.
              </p>
            </a>

            <a
              href="/database-map"
              className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
            >
              <p className="text-sm font-medium text-black/45">Live object map</p>
              <h3 className="mt-2 text-2xl font-semibold">Database Map</h3>
              <p className="mt-3 text-sm leading-6 text-black/55">
                Compare what actually exists in Supabase with what Athena has registered.
              </p>
            </a>

            <a
              href="/sql-queries"
              className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
            >
              <p className="text-sm font-medium text-black/45">Reusable SQL</p>
              <h3 className="mt-2 text-2xl font-semibold">SQL Queries</h3>
              <p className="mt-3 text-sm leading-6 text-black/55">
                View named reusable SQL diagnostics, QA checks, and developer handoff queries.
              </p>
            </a>
          </div>
        </section>




        <footer className="py-8 text-center text-sm text-black/40">
          Athena OS Command Center v1 — connected to Athena Core.
        </footer>
      </section>
    </main>
  );
}