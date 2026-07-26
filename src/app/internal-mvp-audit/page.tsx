import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  Database,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

function n(value: unknown) {
  return typeof value === "number" ? value : Number(value || 0);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function dateText(value: unknown) {
  if (!value || typeof value !== "string") return "No date";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusClass(status: string) {
  if (status === "pass" || status === "completed" || status === "active") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === "warning" || status === "needs_review" || status === "retry_ready") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (status === "fail" || status === "blocked") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-black/10 bg-black/5 text-black/60";
}

function gateStatus(condition: boolean) {
  return condition ? "pass" : "needs_review";
}

export default async function InternalMvpAuditPage() {
  const supabase = createAthenaCoreClient();

  const [
    qaSummaryResult,
    completionEventsResult,
    projectsResult,
    modulesResult,
    buildLogsResult,
    dbChangesResult,
    qaTemplatesResult
  ] = await Promise.all([
    supabase
      .from("athena_qa_run_summary")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("athena_feature_completion_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("athena_projects")
      .select("*")
      .order("project_key", { ascending: true }),
    supabase
      .from("athena_project_modules")
      .select("*")
      .order("project_key", { ascending: true })
      .order("priority", { ascending: true }),
    supabase
      .from("athena_build_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("athena_database_changes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("athena_qa_prefill_templates")
      .select("*")
      .order("feature_type", { ascending: true })
  ]);

  const qaRows = qaSummaryResult.data || [];
  const completionEvents = completionEventsResult.data || [];
  const projects = projectsResult.data || [];
  const modules = modulesResult.data || [];
  const buildLogs = buildLogsResult.data || [];
  const dbChanges = dbChangesResult.data || [];
  const qaTemplates = qaTemplatesResult.data || [];

  const qaReadErrors = [
    qaSummaryResult.error,
    completionEventsResult.error,
    projectsResult.error,
    modulesResult.error,
    buildLogsResult.error,
    dbChangesResult.error,
    qaTemplatesResult.error
  ].filter(Boolean);

  const openQaProblems = qaRows.filter((row) => {
    return n(row.pending_checks) > 0 || n(row.failed_checks) > 0;
  });

  const warningQaRuns = qaRows.filter((row) => n(row.warning_checks) > 0);

  const incompleteCompletionEvents = completionEvents.filter((event) => {
    return (
      text(event.status) !== "completed" ||
      event.cto_recorded !== true ||
      event.memory_check_closed !== true
    );
  });

  const athenaOsProject = projects.find((project) => text(project.project_key) === "athena-os");
  const activeAthenaModules = modules.filter((module) => {
    return text(module.project_key) === "athena-os" && text(module.status) !== "archived";
  });

  const has0071 = completionEvents.some((event) => {
    return text(event.build_session_title) === "0071 Production access control / owner-admin guard" &&
      text(event.status) === "completed" &&
      event.cto_recorded === true &&
      event.memory_check_closed === true;
  });

  const has0072 = completionEvents.some((event) => {
    return text(event.build_session_title) === "0072 Production RLS hardening foundation" &&
      text(event.status) === "completed" &&
      event.cto_recorded === true &&
      event.memory_check_closed === true;
  });

  const has0073 = completionEvents.some((event) => {
    return text(event.build_session_title) === "0073 QA Prefill Template preview before applying" &&
      text(event.status) === "completed" &&
      event.cto_recorded === true &&
      event.memory_check_closed === true;
  });

  const activeTemplates = qaTemplates.filter((template) => text(template.status) === "active");

  const auditGates = [
    {
      name: "Operator guard closed",
      status: gateStatus(has0071),
      detail: "0071 completion event exists, CTO recorded, and memory check closed."
    },
    {
      name: "RLS hardening closed",
      status: gateStatus(has0072),
      detail: "0072 completion event exists after service-role server client and public access revocation."
    },
    {
      name: "QA preview closed",
      status: gateStatus(has0073),
      detail: "0073 completion event exists and /qa-prefill-preview is protected."
    },
    {
      name: "No pending/failed QA runs",
      status: gateStatus(openQaProblems.length === 0),
      detail: `${openQaProblems.length} QA runs have pending or failed checks.`
    },
    {
      name: "No incomplete completion events",
      status: gateStatus(incompleteCompletionEvents.length === 0),
      detail: `${incompleteCompletionEvents.length} completion events need repair or review.`
    },
    {
      name: "QA templates active",
      status: gateStatus(activeTemplates.length >= 4),
      detail: `${activeTemplates.length} active QA prefill templates found.`
    },
    {
      name: "Build logs available",
      status: gateStatus(buildLogs.length > 0),
      detail: `${buildLogs.length} recent build logs loaded.`
    }
  ];

  const failingGates = auditGates.filter((gate) => gate.status !== "pass");

  const internalMvpStatus =
    failingGates.length === 0
      ? "pass"
      : openQaProblems.length > 0 || incompleteCompletionEvents.length > 0
        ? "blocked"
        : "warning";

  const internalMvpLabel =
    internalMvpStatus === "pass"
      ? "Internal MVP ready"
      : internalMvpStatus === "blocked"
        ? "Blocked"
        : "Ready with warnings";

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
            href="/qa"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ListChecks className="h-4 w-4" />
            QA Center
          </Link>

          <Link
            href="/completion-history"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <History className="h-4 w-4" />
            Completion History
          </Link>

          <Link
            href="/database-changes"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Database className="h-4 w-4" />
            Database Changes
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <ShieldCheck className="h-4 w-4" />
            Athena OS Internal MVP Audit
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                Final internal readiness check
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                This page checks whether Athena OS is ready to be used as the control layer for future builds, QA, project memory, database changes, and completion history.
              </p>
            </div>

            <div className={`rounded-[2rem] border p-6 ${statusClass(internalMvpStatus)}`}>
              <p className="text-sm font-medium opacity-70">Current status</p>
              <p className="mt-2 text-3xl font-semibold">{internalMvpLabel}</p>
              <p className="mt-3 text-sm leading-6 opacity-80">
                {failingGates.length === 0
                  ? "All internal MVP gates are currently passing."
                  : `${failingGates.length} audit gate(s) need review.`}
              </p>
            </div>
          </div>
        </header>

        {qaReadErrors.length > 0 ? (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-medium">Audit read errors</p>
            <ul className="mt-2 list-inside list-disc">
              {qaReadErrors.map((error, index) => (
                <li key={index}>{error?.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ListChecks className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Open QA problems</p>
            <p className="mt-2 text-3xl font-semibold">{openQaProblems.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ClipboardCheck className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Incomplete events</p>
            <p className="mt-2 text-3xl font-semibold">{incompleteCompletionEvents.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ShieldAlert className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Documented warnings</p>
            <p className="mt-2 text-3xl font-semibold">{warningQaRuns.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Database className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">DB changes registered</p>
            <p className="mt-2 text-3xl font-semibold">{dbChanges.length}</p>
          </div>
        </section>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Audit gates</p>
            <h2 className="text-3xl font-semibold">Internal MVP checklist</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {auditGates.map((gate) => (
              <article
                key={gate.name}
                className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(gate.status)}`}>
                    {gate.status}
                  </span>
                </div>

                <h3 className="text-xl font-semibold">{gate.name}</h3>
                <p className="mt-3 text-sm leading-6 text-black/60">{gate.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <LayoutDashboard className="h-6 w-6" />
              <div>
                <p className="text-sm font-medium text-black/45">Project status</p>
                <h2 className="text-3xl font-semibold">Athena OS</h2>
              </div>
            </div>

            {athenaOsProject ? (
              <div className="space-y-4">
                <p className="text-sm text-black/60">
                  <span className="font-medium text-black">Status:</span>{" "}
                  {text(athenaOsProject.status) || "unknown"}
                </p>
                <p className="text-sm text-black/60">
                  <span className="font-medium text-black">Progress:</span>{" "}
                  {n(athenaOsProject.progress_percent)}%
                </p>
                <p className="text-sm text-black/60">
                  <span className="font-medium text-black">Estimated remaining hours:</span>{" "}
                  {n(athenaOsProject.estimated_remaining_hours)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-red-700">Athena OS project row was not found.</p>
            )}

            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-black/45">Active Athena OS modules</p>
              <div className="grid gap-3">
                {activeAthenaModules.slice(0, 8).map((module) => (
                  <div
                    key={`${module.project_key}-${module.module_key}`}
                    className="rounded-2xl bg-[#fbfaf7] p-4"
                  >
                    <p className="font-medium">{text(module.name) || text(module.module_key)}</p>
                    <p className="mt-1 text-xs text-black/45">
                      {text(module.module_key)} · {text(module.status)} · {n(module.estimated_remaining_hours)}h left
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <FileText className="h-6 w-6" />
              <div>
                <p className="text-sm font-medium text-black/45">Latest build logs</p>
                <h2 className="text-3xl font-semibold">Recent memory</h2>
              </div>
            </div>

            <div className="grid gap-3">
              {buildLogs.slice(0, 8).map((log) => (
                <article
                  key={`${log.product_key}-${log.session_title}-${log.created_at}`}
                  className="rounded-2xl bg-[#fbfaf7] p-4"
                >
                  <p className="font-medium">{text(log.session_title)}</p>
                  <p className="mt-1 text-xs text-black/45">
                    {text(log.product_key)} · {dateText(log.created_at)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {openQaProblems.length > 0 ? (
          <section className="mb-6 rounded-[2.5rem] border border-red-200 bg-red-50 p-8 shadow-sm">
            <div className="mb-5 flex items-center gap-3 text-red-900">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-3xl font-semibold">QA blockers</h2>
            </div>

            <div className="grid gap-3">
              {openQaProblems.slice(0, 10).map((qaRun) => (
                <div key={`${qaRun.feature_name}-${qaRun.build_session_title}`} className="rounded-2xl bg-white p-4">
                  <p className="font-medium">{text(qaRun.feature_name)}</p>
                  <p className="mt-1 font-mono text-xs text-black/45">{text(qaRun.build_session_title)}</p>
                  <p className="mt-2 text-sm text-red-700">
                    Pending: {n(qaRun.pending_checks)} · Failed: {n(qaRun.failed_checks)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="py-8 text-center text-sm text-black/40">
          Athena OS Internal MVP Audit v1
        </footer>
      </section>
    </main>
  );
}