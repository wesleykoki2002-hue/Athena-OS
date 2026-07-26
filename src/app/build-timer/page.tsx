import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCheck,
  Clock3,
  FileText,
  ShieldCheck
} from "lucide-react";

import {
  requireTimerOperatorSession
} from "@/lib/auth/require-timer-operator-session";
import {
  createAthenaCoreClient
} from "@/lib/supabase/server";

import BuildTimerPanel, {
  type TimerModuleOption,
  type TimerProjectOption
} from "./BuildTimerPanel";

type BuildTimerPageProps = {
  searchParams: Promise<{
    project_key?: string;
    module_key?: string;
    build_session_title?: string;
  }>;
};

function clean(
  value: string | undefined
) {
  return value?.trim() || "";
}

export default async function BuildTimerPage({
  searchParams
}: BuildTimerPageProps) {
  await requireTimerOperatorSession(
    "/build-timer"
  );

  const query = await searchParams;
  const supabase =
    createAthenaCoreClient();

  const [
    projectsResult,
    modulesResult
  ] = await Promise.all([
    supabase
      .from("athena_projects")
      .select(
        "project_key, name, priority, status"
      )
      .order(
        "priority",
        {
          ascending: true
        }
      )
      .order(
        "name",
        {
          ascending: true
        }
      )
      .returns<TimerProjectOption[]>(),

    supabase
      .from("athena_project_modules")
      .select(
        "project_key, module_key, name, priority, status"
      )
      .neq(
        "status",
        "archived"
      )
      .order(
        "project_key",
        {
          ascending: true
        }
      )
      .order(
        "priority",
        {
          ascending: true
        }
      )
      .order(
        "name",
        {
          ascending: true
        }
      )
      .returns<TimerModuleOption[]>()
  ]);

  const projects =
    projectsResult.data || [];

  const modules =
    modulesResult.data || [];

  const registryErrors: string[] =
    [];

  if (projectsResult.error) {
    registryErrors.push(
      "Athena could not load public.athena_projects."
    );
  }

  if (modulesResult.error) {
    registryErrors.push(
      "Athena could not load public.athena_project_modules."
    );
  }

  const registryError =
    registryErrors.length > 0
      ? registryErrors.join(" ")
      : null;

  const requestedProjectKey =
    clean(query.project_key);

  const selectedProject =
    projects.find(
      (project) =>
        project.project_key ===
        requestedProjectKey
    ) || null;

  const initialProjectKey =
    selectedProject?.project_key || "";

  const requestedModuleKey =
    clean(query.module_key);

  const selectedModule =
    modules.find(
      (moduleItem) =>
        moduleItem.project_key ===
          initialProjectKey &&
        moduleItem.module_key ===
          requestedModuleKey
    ) || null;

  const initialModuleKey =
    selectedModule?.module_key || "";

  const initialBuildSessionTitle =
    clean(
      query.build_session_title
    );

  const invalidProjectSelection =
    Boolean(requestedProjectKey) &&
    !selectedProject;

  const invalidModuleSelection =
    Boolean(requestedModuleKey) &&
    Boolean(selectedProject) &&
    !selectedModule;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
        <nav className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Athena OS
          </Link>

          <Link
            href="/start-build"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <FileText className="h-4 w-4" />
            Start-Build Prompt
          </Link>

          <Link
            href="/complete-feature"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ClipboardCheck className="h-4 w-4" />
            Complete Feature
          </Link>
        </nav>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Clock3 className="h-4 w-4" />
            Athena Build Timer
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Record verified build hours
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Track active, paused, idle, stale, and
            corrected build time using canonical
            project and module identities.
          </p>

          <div className="mt-6 grid gap-3 rounded-[2rem] bg-[#f5f1ea] p-5 text-sm md:grid-cols-3">
            <div>
              <p className="text-black/45">
                Heartbeat
              </p>
              <p className="mt-1 font-semibold">
                Every 60 seconds
              </p>
            </div>

            <div>
              <p className="text-black/45">
                Idle threshold
              </p>
              <p className="mt-1 font-semibold">
                10 minutes
              </p>
            </div>

            <div>
              <p className="text-black/45">
                Stale timeout
              </p>
              <p className="mt-1 font-semibold">
                3 minutes
              </p>
            </div>
          </div>
        </header>

        {invalidProjectSelection ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            The requested project key is not
            registered in
            public.athena_projects. No project was
            created or substituted automatically.
          </div>
        ) : null}

        {invalidModuleSelection ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            The requested module is not registered
            for the selected project. The module
            selection was cleared.
          </div>
        ) : null}

        <BuildTimerPanel
          projects={projects}
          modules={modules}
          registryError={registryError}
          initialProjectKey={
            initialProjectKey
          }
          initialModuleKey={
            initialModuleKey
          }
          initialBuildSessionTitle={
            initialBuildSessionTitle
          }
        />

        <section className="mt-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm font-medium text-black/45">
                Governance boundary
              </p>

              <h2 className="mt-1 text-2xl font-semibold">
                Timer recording does not start a build
              </h2>

              <p className="mt-3 max-w-4xl text-sm leading-6 text-black/60">
                The timer records verified execution
                time only. It does not create a project
                or module, assign a build ID, persist a
                build start, approve work, change
                priority, modify estimates, or complete
                a feature.
              </p>
            </div>
          </div>
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Build Timer v1
        </footer>
      </section>
    </main>
  );
}