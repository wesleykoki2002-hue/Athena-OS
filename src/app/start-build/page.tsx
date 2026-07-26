import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCheck,
  Clock3,
  FileText,
  Rocket,
  ShieldCheck
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import StartBuildForm, {
  type ProjectModuleOption,
  type ProjectOption
} from "./StartBuildForm";

type StartBuildPageProps = {
  searchParams: Promise<{
    project_name?: string;
    project_key?: string;
    module_key?: string;
    build_id?: string;
    build_title?: string;
    target_system?: string;
    tracking_system?: string;
    local_folder?: string;
    goal?: string;
    separation_notes?: string;
  }>;
};

function clean(input: string | undefined) {
  return input?.trim() || "";
}

function buildStarterPrompt(input: {
  projectName: string;
  projectKey: string;
  moduleKey: string;
  buildId: string;
  buildTitle: string;
  targetSystem: string;
  trackingSystem: string;
  localFolder: string;
  goal: string;
  separationNotes: string;
}) {
  return `We are starting ${input.buildId} ${input.buildTitle}.

Important project separation:
- Target project/product: ${input.projectName}
- Target project key: ${input.projectKey}
- Target module key: ${input.moduleKey}
- Target system where product code/data/features live: ${input.targetSystem}
- Tracking system: ${input.trackingSystem}
- Local project folder: ${input.localFolder}

Critical separation rule:
${input.separationNotes}

Current goal:
${input.goal}

Do not mix projects.
Do not write target product tables into Athena Supabase unless the task is explicitly about Athena OS tracking.
Do not store service role keys, API keys, passwords, or secrets in Athena logs or chat-visible records.

Use this build ID:
${input.buildId}

Use this build title:
${input.buildTitle}

Start with a current-state audit before making changes.

First tasks:
1. Ask me what currently exists, or give me safe inspection commands for the target system.
2. Identify the existing tables, files, flows, APIs, routes, and workflows related to this module.
3. Separate what already works from what is missing.
4. Define the smallest MVP that gets us closer to launch.
5. Tell me the first build step without mixing this project with Athena OS.
6. At the end of the feature, give me the exact Athena OS Complete Feature fields so Athena CTO can track it.

When giving commands, label them clearly:
- Run this in ${input.targetSystem}
- Run this in ${input.localFolder}
- Run this in Athena OS / Complete Feature

At the end of each completed feature, give me:
Project:
${input.projectName}

Module key:
${input.moduleKey}

Feature name:
${input.buildId} ${input.buildTitle}

Build session title:
${input.buildId} ${input.buildTitle}

Route path:
Relevant route, page, function, workflow, or database object changed.

Files changed:
List exact files changed.

Database changes:
List target-system database changes only, and clearly mark that they belong to ${input.targetSystem}.

Security notes:
Mention project separation and confirm no secrets were recorded.

Missing:
List what remains incomplete.

Next steps:
Tell me the next build ID and next action.

Summary:
Short summary of what was completed and verified.`;
}

export default async function StartBuildPage({
  searchParams
}: StartBuildPageProps) {
  const query = await searchParams;
  const supabase = createAthenaCoreClient();

  const [projectsResult, modulesResult] = await Promise.all([
    supabase
      .from("athena_projects")
      .select("project_key, name, priority, status")
      .order("priority", { ascending: true })
      .order("name", { ascending: true })
      .returns<ProjectOption[]>(),

    supabase
      .from("athena_project_modules")
      .select("project_key, module_key, name, priority, status")
      .neq("status", "archived")
      .order("project_key", { ascending: true })
      .order("priority", { ascending: true })
      .order("name", { ascending: true })
      .returns<ProjectModuleOption[]>()
  ]);

  const projects = projectsResult.data || [];
  const modules = modulesResult.data || [];

  const registryErrors: string[] = [];

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
    registryErrors.length > 0 ? registryErrors.join(" ") : null;

  const requestedProjectKey = clean(query.project_key);

  const selectedProject =
    projects.find(
      (project) => project.project_key === requestedProjectKey
    ) || null;

  const projectKey = selectedProject?.project_key || "";
  const projectName = selectedProject?.name || "";

  const requestedModuleKey = clean(query.module_key);

  const selectedModule =
    modules.find(
      (moduleItem) =>
        moduleItem.project_key === projectKey &&
        moduleItem.module_key === requestedModuleKey
    ) || null;

  const moduleKey = selectedModule?.module_key || "";

  const buildId = clean(query.build_id);
  const buildTitle = clean(query.build_title);
  const targetSystem = clean(query.target_system);
  const trackingSystem = clean(query.tracking_system);
  const localFolder = clean(query.local_folder);
  const goal = clean(query.goal);
  const separationNotes = clean(query.separation_notes);

  const hasPrompt = Boolean(
    projectName &&
      projectKey &&
      moduleKey &&
      buildId &&
      buildTitle &&
      targetSystem &&
      trackingSystem &&
      localFolder &&
      goal &&
      separationNotes
  );

  const starterPrompt = hasPrompt
    ? buildStarterPrompt({
        projectName,
        projectKey,
        moduleKey,
        buildId,
        buildTitle,
        targetSystem,
        trackingSystem,
        localFolder,
        goal,
        separationNotes
      })
    : "";

  const buildSessionTitle = [
    buildId,
    buildTitle
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const hasTimerIdentity = Boolean(
    projectKey &&
      moduleKey &&
      buildSessionTitle
  );

  const timerSearchParams =
    new URLSearchParams();

  if (hasTimerIdentity) {
    timerSearchParams.set(
      "project_key",
      projectKey
    );

    timerSearchParams.set(
      "module_key",
      moduleKey
    );

    timerSearchParams.set(
      "build_session_title",
      buildSessionTitle
    );
  }

  const timerHref =
    hasTimerIdentity
      ? `/build-timer?${timerSearchParams.toString()}`
      : "/build-timer";

  const invalidProjectSelection =
    Boolean(requestedProjectKey) && !selectedProject;

  const invalidModuleSelection =
    Boolean(requestedModuleKey) &&
    Boolean(selectedProject) &&
    !selectedModule;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Athena OS
          </Link>

          <Link
            href="/operator-workflow"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ShieldCheck className="h-4 w-4" />
            Operator Workflow
          </Link>

          <Link
            href="/complete-feature"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ClipboardCheck className="h-4 w-4" />
            Complete Feature
          </Link>

          <Link
            href={timerHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Clock3 className="h-4 w-4" />
            Build Timer
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Rocket className="h-4 w-4" />
            Cross-Project Build Starter
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Generate the next chat prompt automatically
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Select a canonical project and registered module. Athena writes
            the starter prompt, separation rules, build ID, audit checklist,
            and tracking instructions.
          </p>
        </header>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">
              Build setup
            </p>
            <h2 className="text-3xl font-semibold">Starter fields</h2>
          </div>

          {invalidProjectSelection ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              The requested project key is not registered in
              public.athena_projects. No replacement project was created or
              selected automatically.
            </div>
          ) : null}

          {invalidModuleSelection ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              The requested module is not registered for the selected project.
              The incompatible module selection was cleared.
            </div>
          ) : null}

          <StartBuildForm
            key={`${projectKey}:${moduleKey}:${buildId}:${buildTitle}`}
            projects={projects}
            modules={modules}
            registryError={registryError}
            initialValues={{
              projectKey,
              moduleKey,
              buildId,
              buildTitle,
              targetSystem,
              trackingSystem,
              localFolder,
              goal,
              separationNotes
            }}
          />
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-black/45">
                Copy this into the new chat
              </p>
              <h2 className="text-3xl font-semibold">
                Generated starter prompt
              </h2>
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                hasPrompt
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              <FileText className="h-4 w-4" />
              {hasPrompt ? "Ready to copy" : "Complete the starter fields"}
            </div>
          </div>

          <textarea
            readOnly
            value={starterPrompt}
            rows={34}
            placeholder="Select a registered project and module, complete every starter field, and generate the prompt."
            className="w-full rounded-2xl border border-black/10 bg-[#171717] px-4 py-4 font-mono text-sm leading-6 text-white placeholder:text-white/40 outline-none"
          />

          <p className="mt-4 text-sm leading-6 text-black/55">
            Project name, project key, and module key are validated against
            the canonical Athena registries. Missing projects or modules are
            never created automatically.
          </p>
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Cross-Project Build Starter v2
        </footer>
      </section>
    </main>
  );
}
