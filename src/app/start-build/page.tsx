import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCheck,
  Clock3,
  FileText,
  Rocket,
  ShieldCheck
} from "lucide-react";
import {
  verifyCanonicalBuildLifecycleLocalEvidence
} from "@/lib/build-lifecycle/local-evidence";
import {
  previewCanonicalPreBuildGate
} from "@/lib/build-lifecycle/pre-build-gate";
import type {
  CanonicalBuildLifecycleRequest,
  CanonicalPreBuildGatePreviewResult
} from "@/lib/build-lifecycle/types";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import {
  startCanonicalBuildLifecycleAndRedirect
} from "./lifecycle-actions";
import StartBuildForm, {
  type ProjectModuleOption,
  type ProjectOption
} from "./StartBuildForm";

type StartBuildPageProps = {
  searchParams: Promise<{
    project_name?: string;
    project_key?: string;
    module_key?: string;
    intake_id?: string;
    preparation_package_id?: string;
    build_id?: string;
    build_title?: string;
    target_system?: string;
    tracking_system?: string;
    local_folder?: string;
    goal?: string;
    separation_notes?: string;
    lifecycle_status?: string;
    lifecycle_error?: string;
    lifecycle_build_id?: string;
    lifecycle_transition_id?: string;
    lifecycle_idempotent_replay?: string;
    gate_evaluation_id?: string;
    gate_classification?: string;
    gate_decision?: string;
    gate_scope_hash?: string;
    gate_override_used?: string;
    gate_narrowed_scope?: string;
    gate_blocking_reasons?: string;
  }>;
};

function clean(input: string | undefined) {
  return input?.trim() || "";
}

function normalizeBuildName(value: string, buildId: string) {
  let normalized = value
    .replace(/^\s*[0-9]{4}\s+Build title:\s*/i, "")
    .replace(/^\s*Build title:\s*/i, "")
    .trim();

  if (buildId && normalized.toLowerCase().startsWith(`${buildId.toLowerCase()} `)) {
    normalized = normalized.slice(buildId.length + 1).trim();
  }

  return normalized;
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
  gateEvaluationId: string;
  gateClassification: string;
  gateDecision: string;
  gateScopeHash: string;
  gateOverrideUsed: boolean;
  gateNarrowedScope: string;
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

Mandatory pre-build gate:
- Evaluation ID: ${input.gateEvaluationId || "Not yet persisted"}
- Classification: ${input.gateClassification || "Not yet evaluated"}
- Decision: ${input.gateDecision || "Not yet evaluated"}
- Scope hash: ${input.gateScopeHash || "Not yet persisted"}
- Governed override used: ${input.gateOverrideUsed ? "yes" : "no"}
- Allowed implementation delta: ${input.gateNarrowedScope || "Use the approved preparation-package scope only."}

Do not rebuild completed or already-existing capability outside the allowed implementation delta.

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
      .select("id, project_key, module_key, name, priority, status")
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
  const moduleId = selectedModule?.id || "";

  const intakeId = clean(query.intake_id);
  const preparationPackageId = clean(
    query.preparation_package_id
  );
  const buildId = clean(query.build_id);
  const buildTitle = clean(query.build_title);
  const targetSystem = clean(query.target_system);
  const trackingSystem = clean(query.tracking_system);
  const localFolder = clean(query.local_folder);
  const goal = clean(query.goal);
  const separationNotes = clean(query.separation_notes);
  const lifecycleStatus = clean(query.lifecycle_status);
  const lifecycleError = clean(query.lifecycle_error);
  const lifecycleBuildId = clean(query.lifecycle_build_id);
  const lifecycleTransitionId = clean(
    query.lifecycle_transition_id
  );
  const lifecycleIdempotentReplay =
    clean(query.lifecycle_idempotent_replay) === "true";
  const gateEvaluationId = clean(query.gate_evaluation_id);
  const gateClassification = clean(query.gate_classification);
  const gateDecision = clean(query.gate_decision);
  const gateScopeHash = clean(query.gate_scope_hash);
  const gateOverrideUsed = clean(query.gate_override_used) === "true";
  const gateNarrowedScope = clean(query.gate_narrowed_scope);
  const gateBlockingReasons = clean(query.gate_blocking_reasons)
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);

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
      separationNotes &&
      lifecycleStatus === "started" &&
      gateEvaluationId &&
      gateScopeHash
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
        separationNotes,
        gateEvaluationId,
        gateClassification,
        gateDecision,
        gateScopeHash,
        gateOverrideUsed,
        gateNarrowedScope
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

  const lifecycleReady = Boolean(
    intakeId &&
      preparationPackageId &&
      projectKey &&
      moduleKey &&
      moduleId &&
      buildTitle &&
      targetSystem &&
      trackingSystem
  );

  let gatePreview: CanonicalPreBuildGatePreviewResult | null = null;
  let gatePreviewError = "";

  if (lifecycleReady && lifecycleStatus !== "started") {
    try {
      const request: CanonicalBuildLifecycleRequest = {
        intakeId,
        preparationPackageId,
        projectKey,
        moduleKey,
        moduleId,
        buildName: normalizeBuildName(buildTitle, buildId),
        targetSystem,
        trackingSystem
      };
      const localEvidence =
        await verifyCanonicalBuildLifecycleLocalEvidence(request);

      gatePreview = await previewCanonicalPreBuildGate({
        request,
        localEvidence,
        requestEvidence: {
          local_handoff_verified: true,
          repository_path_verified: true,
          repository_branch_verified: true,
          repository_head_verified: true,
          repository_tree_verified: true,
          repository_evidence_verified: true,
          tracked_diff_empty: true,
          staged_diff_empty: true,
          supabase_project_verified: true,
          target_supabase_project_verified: true,
          target_supabase_project_ref: localEvidence.targetSupabaseProjectRef,
          repository_branch: localEvidence.repositoryBranch,
          build_identity_kind: localEvidence.buildIdentityKind,
          canonical_build_id: localEvidence.canonicalBuildId,
          canonical_build_title: localEvidence.canonicalBuildTitle,
          preview_only: true,
          evidence_schema: "canonical-pre-build-gate-preview-v2"
        }
      });
    } catch (error) {
      gatePreviewError =
        error instanceof Error
          ? error.message
          : "Mandatory pre-build gate preview failed without a verified error.";
    }
  }

  const effectiveGateClassification =
    gateClassification || gatePreview?.classification || "";
  const effectiveGateDecision =
    gateDecision || gatePreview?.decision || "";
  const effectiveGateScopeHash =
    gateScopeHash || gatePreview?.scope_hash || "";
  const effectiveBlockingReasons =
    gateBlockingReasons.length > 0
      ? gateBlockingReasons
      : gatePreview?.blocking_reasons || [];

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
            key={`${projectKey}:${moduleKey}:${intakeId}:${preparationPackageId}:${buildId}:${buildTitle}`}
            projects={projects}
            modules={modules}
            registryError={registryError}
            initialValues={{
              projectKey,
              moduleKey,
              intakeId,
              preparationPackageId,
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

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-black/45">
                Canonical control-plane operation
              </p>
              <h2 className="text-3xl font-semibold">
                Governed assignment and formal start
              </h2>
            </div>

            <div className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800">
              Database preserves approved external IDs or derives Athena numeric IDs
            </div>
          </div>

          <p className="max-w-4xl text-sm leading-6 text-black/60">
            This is separate from starter-prompt generation. The server verifies
            the signed operator session, approved Intake, exact preparation
            package, canonical registries, prior-build closure, repository,
            handoff, Supabase identity, existing capability, redundancy,
            scope narrowing, target repository evidence, target Supabase identity,
            and collision state. The submitted Build ID field is never trusted by
            the lifecycle RPC. The database preserves an approved external project
            identity or derives the next Athena numeric ID under global locking,
            then recomputes the gate atomically before formal start.
          </p>

          {lifecycleStatus === "started" ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
              <p className="font-semibold">
                Canonical build assignment and formal start verified.
              </p>
              <p className="mt-2 font-mono">
                Build ID: {lifecycleBuildId || buildId}
              </p>
              <p className="mt-1 break-all font-mono">
                Transition: {lifecycleTransitionId || "Not returned"}
              </p>
              <p className="mt-2">
                Idempotent replay: {lifecycleIdempotentReplay ? "yes" : "no"}
              </p>
              <p className="mt-2">
                Gate classification: {effectiveGateClassification || "Not returned"}
              </p>
              <p className="mt-1">
                Gate decision: {effectiveGateDecision || "Not returned"}
              </p>
              <p className="mt-1 break-all font-mono">
                Gate evaluation: {gateEvaluationId || "Not returned"}
              </p>
              <p className="mt-1 break-all font-mono">
                Scope hash: {effectiveGateScopeHash || "Not returned"}
              </p>
              <p className="mt-1">
                Governed override used: {gateOverrideUsed ? "yes" : "no"}
              </p>
              <p className="mt-2">
                No timer, QA, completion, or build log was created implicitly.
              </p>
            </div>
          ) : null}

          {lifecycleStatus === "blocked" ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <p className="font-semibold">
                Mandatory pre-build gate blocked formal start.
              </p>
              <p className="mt-2">
                Classification: {effectiveGateClassification || "Not returned"}
              </p>
              {effectiveBlockingReasons.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {effectiveBlockingReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {lifecycleStatus === "error" && lifecycleError ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              <p className="font-semibold">
                Governed lifecycle request failed closed.
              </p>
              <p className="mt-2 break-words">{lifecycleError}</p>
            </div>
          ) : null}

          {gatePreviewError ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              <p className="font-semibold">
                Mandatory pre-build gate preview failed closed.
              </p>
              <p className="mt-2 break-words">{gatePreviewError}</p>
            </div>
          ) : null}

          {gatePreview ? (
            <div className={`mt-6 rounded-2xl border p-5 text-sm ${
              gatePreview.decision === "pass"
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">Mandatory pre-build gate preview</p>
                <span className="rounded-full bg-white/70 px-3 py-1 font-medium">
                  {gatePreview.decision.toUpperCase()}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <p>Classification: <strong>{gatePreview.classification}</strong></p>
                <p>Candidate matches: <strong>{gatePreview.candidate_count}</strong></p>
                <p>Top score: <strong>{gatePreview.top_match_score.toFixed(4)}</strong></p>
                <p className="break-all font-mono">Scope hash: {gatePreview.scope_hash}</p>
              </div>
              <p className="mt-4 font-medium">Allowed implementation delta</p>
              <p className="mt-1 leading-6">{gatePreview.narrowed_scope}</p>
              {gatePreview.missing_evidence.length > 0 ? (
                <>
                  <p className="mt-4 font-medium">Missing evidence</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {gatePreview.missing_evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {gatePreview.blocking_reasons.length > 0 ? (
                <>
                  <p className="mt-4 font-medium">Blocking reasons</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {gatePreview.blocking_reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {gatePreview.candidates.length > 0 ? (
                <>
                  <p className="mt-4 font-medium">Top candidate evidence</p>
                  <div className="mt-2 space-y-2">
                    {gatePreview.candidates.slice(0, 5).map((candidate) => (
                      <div key={`${candidate.source_type}:${candidate.source_id}`} className="rounded-xl border border-black/10 bg-white/60 p-3">
                        <p className="font-medium">{candidate.candidate_title}</p>
                        <p className="mt-1 text-xs">
                          {candidate.source_type} · score {candidate.final_score.toFixed(4)} · completed {candidate.completed ? "yes" : "no"}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <form
            action={startCanonicalBuildLifecycleAndRedirect}
            className="mt-6 grid gap-4 rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 md:grid-cols-2"
          >
            <input type="hidden" name="intake_id" value={intakeId} />
            <input
              type="hidden"
              name="preparation_package_id"
              value={preparationPackageId}
            />
            <input type="hidden" name="project_key" value={projectKey} />
            <input type="hidden" name="module_key" value={moduleKey} />
            <input type="hidden" name="module_id" value={moduleId} />
            <input type="hidden" name="build_name" value={buildTitle} />
            <input
              type="hidden"
              name="target_system"
              value={targetSystem}
            />
            <input
              type="hidden"
              name="tracking_system"
              value={trackingSystem}
            />

            <input
              type="hidden"
              name="return_project_name"
              value={projectName}
            />
            <input
              type="hidden"
              name="return_build_id"
              value={buildId}
            />
            <input
              type="hidden"
              name="return_local_folder"
              value={localFolder}
            />
            <input type="hidden" name="return_goal" value={goal} />
            <input
              type="hidden"
              name="return_separation_notes"
              value={separationNotes}
            />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-black/40">
                Approved Intake
              </p>
              <p className="mt-1 break-all font-mono text-sm">
                {intakeId || "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-black/40">
                Preparation package
              </p>
              <p className="mt-1 break-all font-mono text-sm">
                {preparationPackageId || "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-black/40">
                Canonical project / module
              </p>
              <p className="mt-1 font-mono text-sm">
                {projectKey || "-"} / {moduleKey || "-"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-black/40">
                Build name
              </p>
              <p className="mt-1 text-sm">
                {buildTitle || "Not provided"}
              </p>
            </div>

            {gatePreview?.decision === "block" ? (
              <div className="md:col-span-2 rounded-2xl border border-amber-300 bg-amber-50 p-5">
                <p className="font-semibold text-amber-950">Governed override</p>
                <p className="mt-1 text-sm leading-6 text-amber-900/80">
                  A blocked classification can proceed only after the signed
                  operator gives a concrete reason and acknowledges every
                  persisted blocking-reason code. The database verifies this
                  again in the same transaction as formal start.
                </p>
                <label className="mt-4 block text-sm font-medium text-amber-950">
                  Override reason
                </label>
                <textarea
                  name="override_reason"
                  rows={4}
                  required
                  className="mt-2 w-full rounded-xl border border-amber-300 bg-white px-3 py-3 outline-none"
                />
                <div className="mt-4 space-y-2">
                  {gatePreview.blocking_reasons.map((reason) => (
                    <label key={reason} className="flex items-start gap-3 text-sm text-amber-950">
                      <input
                        type="checkbox"
                        name="override_acknowledged_reason_codes"
                        value={reason}
                        required
                        className="mt-1"
                      />
                      <span>I acknowledge: {reason}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={
                !lifecycleReady ||
                lifecycleStatus === "started" ||
                !gatePreview ||
                Boolean(gatePreviewError)
              }
              className="md:col-span-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {lifecycleStatus === "started"
                ? "Canonical build already started"
                : gatePreview?.decision === "block"
                  ? "Override gate and formally start canonical build"
                  : "Pass gate, assign, and formally start canonical build"}
            </button>
          </form>

          {!lifecycleReady ? (
            <p className="mt-4 text-sm text-amber-700">
              Generate or refresh the starter fields with an approved Intake,
              exact preparation package, registered module, build title, target
              system, and tracking system before requesting the mandatory gate
              and formal start.
            </p>
          ) : null}
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
              {hasPrompt
                ? "Ready to copy"
                : lifecycleReady
                  ? "Formal gate start required"
                  : "Complete the starter fields"}
            </div>
          </div>

          <textarea
            readOnly
            value={starterPrompt}
            rows={34}
            placeholder="Complete the starter fields, pass the mandatory gate, and formally start the canonical build before copying the prompt."
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
