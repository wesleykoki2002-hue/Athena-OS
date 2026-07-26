import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  ShieldCheck,
  Sparkles,
  XCircle
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type QaTemplate = {
  template_key: string;
  name: string;
  description: string | null;
  scope: string;
  status: string;
  checklist: unknown[];
  updated_at: string;
};

type QaRunSummary = {
  id: string;
  qa_run_key: string;
  project_key: string;
  module_key: string | null;
  feature_name: string;
  route_path: string | null;
  template_key: string | null;
  status: string;
  summary: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  total_checks: number;
  passed_checks: number;
  warning_checks: number;
  failed_checks: number;
  pending_checks: number;
  not_applicable_checks: number;
  computed_status: string;
  build_session_title: string | null;
};

function statusBadge(status: string) {
  if (status === "pass") return "bg-green-50 text-green-700 border-green-200";
  if (status === "fail") return "bg-red-50 text-red-700 border-red-200";
  if (status === "warning") return "bg-yellow-50 text-yellow-800 border-yellow-200";
  if (status === "pending") return "bg-black/5 text-black/60 border-black/10";
  return "bg-black text-white border-black";
}

function statusIcon(status: string) {
  if (status === "pass") return <CheckCircle2 className="h-5 w-5" />;
  if (status === "fail") return <XCircle className="h-5 w-5" />;
  if (status === "warning") return <AlertTriangle className="h-5 w-5" />;
  return <Clock className="h-5 w-5" />;
}

export default async function QaPage() {
  const supabase = createAthenaCoreClient();

  const { data: templates, error: templateError } = await supabase
    .from("athena_qa_templates")
    .select("template_key, name, description, scope, status, checklist, updated_at")
    .order("created_at", { ascending: false })
    .returns<QaTemplate[]>();

  const { data: runs, error: runsError } = await supabase
    .from("athena_qa_run_summary")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<QaRunSummary[]>();

  const templateList = templates || [];
  const runList = runs || [];

  const passCount = runList.filter((run) => run.status === "pass").length;
  const warningCount = runList.filter((run) => run.status === "warning").length;
  const failCount = runList.filter((run) => run.status === "fail").length;
  const pendingCount = runList.filter(
    (run) => run.status === "pending" || run.status === "draft"
  ).length;
  const notApplicableCount = runList.reduce((total, run) => total + Number(run.not_applicable_checks || 0), 0);

  const activeTemplate = templateList.find(
    (template) => template.template_key === "athena-feature-completion-gate-v1"
  );

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
                <ClipboardCheck className="h-4 w-4" />
                Athena QA Gate
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                QA Center
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                This is where Athena double-checks features before we mark them working. QA should verify UI, database writes, calculations, source-of-truth, security, regression risk, and Athena CTO memory.
              </p>
            </div>

            <Link
              href="/qa/new"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
            >
              <Sparkles className="h-4 w-4" />
              New QA Run
            </Link>
          </div>
        </header>

        {templateError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Template read error: {templateError.message}
          </div>
        ) : null}

        {runsError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            QA run read error: {runsError.message}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <FileCheck2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">QA runs</p>
            <p className="mt-2 text-3xl font-semibold">{runList.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <CheckCircle2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Passed</p>
            <p className="mt-2 text-3xl font-semibold">{passCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">N/A checks</p>
            <p className="mt-2 text-3xl font-semibold">{notApplicableCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <AlertTriangle className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Warnings</p>
            <p className="mt-2 text-3xl font-semibold">{warningCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <XCircle className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Failed</p>
            <p className="mt-2 text-3xl font-semibold">{failCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Pending/Draft</p>
            <p className="mt-2 text-3xl font-semibold">{pendingCount}</p>
          </div>
        </div>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm font-medium text-black/45">Active template</p>
              <h2 className="text-3xl font-semibold">
                {activeTemplate ? activeTemplate.name : "No active QA template found"}
              </h2>
            </div>
          </div>

          {activeTemplate ? (
            <div>
              <p className="max-w-4xl leading-7 text-black/60">
                {activeTemplate.description}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl bg-[#f5f1ea] p-5">
                  <p className="text-sm text-black/45">Template key</p>
                  <p className="mt-2 break-words font-semibold">{activeTemplate.template_key}</p>
                </div>

                <div className="rounded-3xl bg-[#f5f1ea] p-5">
                  <p className="text-sm text-black/45">Checks</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {Array.isArray(activeTemplate.checklist) ? activeTemplate.checklist.length : 0}
                  </p>
                </div>

                <div className="rounded-3xl bg-[#f5f1ea] p-5">
                  <p className="text-sm text-black/45">Status</p>
                  <p className="mt-2 font-semibold">{activeTemplate.status}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No QA template found</p>
              <p className="mt-2 text-sm text-black/55">
                Run the QA template seed SQL before creating QA runs.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-black/45">Latest QA history</p>
              <h2 className="text-3xl font-semibold">QA runs</h2>
            </div>

            <p className="text-sm text-black/45">
              Features should not be marked working until QA is pass. Acknowledged warnings remain visible but do not block a verified pass.
            </p>
          </div>

          {runList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No QA runs yet</p>
              <p className="mt-2 text-sm text-black/55">
                Next we will create /qa/new so Athena can start generating QA runs from the checklist template.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {runList.map((run) => (
                <Link
                  key={run.id}
                  href={`/qa/${run.id}`}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6 transition hover:bg-[#f5f1ea]"
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(run.status)}`}>
                      {statusIcon(run.status)}
                      {run.status}
                    </span>

                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {run.project_key}
                    </span>

                    {run.module_key ? (
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {run.module_key}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-2xl font-semibold">{run.feature_name}</h3>

                  {run.build_session_title ? (
                    <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black/70">
                      {run.build_session_title}
                    </p>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-800">
                      No build session title linked yet
                    </p>
                  )}

                  {run.route_path ? (
                    <p className="mt-2 text-sm text-black/45">{run.route_path}</p>
                  ) : null}

                  <div className="mt-5 grid gap-3 text-sm md:grid-cols-3 lg:grid-cols-6">
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-black/40">Total</p>
                      <p className="mt-1 font-semibold">{run.total_checks}</p>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-black/40">Pass</p>
                      <p className="mt-1 font-semibold">{run.passed_checks}</p>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-black/40">Warn</p>
                      <p className="mt-1 font-semibold">{run.warning_checks}</p>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-black/40">Fail</p>
                      <p className="mt-1 font-semibold">{run.failed_checks}</p>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-black/40">Pending</p>
                      <p className="mt-1 font-semibold">{run.pending_checks}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena QA Gate v1
        </footer>
      </section>
    </main>
  );
}
