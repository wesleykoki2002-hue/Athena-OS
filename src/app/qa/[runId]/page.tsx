import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Save,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import {
  completeQaRun,
  updateQaCheckResult
} from "@/app/qa/actions";
import {
  computeQaStatus,
  warningIsAcknowledged
} from "@/lib/qa-status";

type QaRunPageProps = {
  params: Promise<{
    runId: string;
  }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type QaRun = {
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
  build_session_title: string | null;
};

type QaCheck = {
  id: string;
  qa_run_id: string;
  check_key: string;
  check_name: string;
  category: string;
  status: string;
  severity: string;
  expected_result: string | null;
  actual_result: string | null;
  notes: string | null;
  warning_acknowledged_at: string | null;
  warning_acknowledged_by: string | null;
  warning_acknowledgement_notes: string | null;
};

type LinkedPacket = {
  id: string;
  status: string;
};

function statusBadge(status: string) {
  if (status === "pass") {
    return "bg-green-50 text-green-700 border-green-200";
  }

  if (status === "fail") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  if (status === "warning") {
    return "bg-yellow-50 text-yellow-800 border-yellow-200";
  }

  if (status === "not_applicable") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  return "bg-black/5 text-black/60 border-black/10";
}

function statusIcon(status: string) {
  if (status === "pass") {
    return <CheckCircle2 className="h-5 w-5" />;
  }

  if (status === "fail") {
    return <XCircle className="h-5 w-5" />;
  }

  if (status === "warning") {
    return <AlertTriangle className="h-5 w-5" />;
  }

  return <Clock className="h-5 w-5" />;
}

export default async function QaRunDetailPage({
  params,
  searchParams
}: QaRunPageProps) {
  const { runId } = await params;
  const query = await searchParams;
  const supabase = createAthenaCoreClient();

  const [
    { data: run, error: runError },
    { data: checks, error: checksError },
    { data: linkedPacket }
  ] = await Promise.all([
    supabase
      .from("athena_qa_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle<QaRun>(),
    supabase
      .from("athena_qa_check_results")
      .select("*")
      .eq("qa_run_id", runId)
      .order("severity", { ascending: true })
      .order("category", { ascending: true })
      .returns<QaCheck[]>(),
    supabase
      .from("athena_feature_completion_packets")
      .select("id, status")
      .eq("qa_run_id", runId)
      .maybeSingle<LinkedPacket>()
  ]);

  const checkList = checks || [];
  const passCount = checkList.filter(
    (check) => check.status === "pass"
  ).length;
  const warningCount = checkList.filter(
    (check) => check.status === "warning"
  ).length;
  const acknowledgedWarningCount = checkList.filter(
    (check) => warningIsAcknowledged(check)
  ).length;
  const unacknowledgedWarningCount =
    warningCount - acknowledgedWarningCount;
  const failCount = checkList.filter(
    (check) => check.status === "fail"
  ).length;
  const pendingCount = checkList.filter(
    (check) => check.status === "pending"
  ).length;
  const notApplicableCount = checkList.filter(
    (check) => check.status === "not_applicable"
  ).length;
  const computedStatus = computeQaStatus(checkList);

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/qa"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to QA Center
          </Link>

          {run ? (
            <Link
              href={`/projects/${run.project_key}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
            >
              <ShieldCheck className="h-4 w-4" />
              Project
            </Link>
          ) : null}

          {linkedPacket ? (
            <Link
              href={`/complete-feature?packet_id=${linkedPacket.id}`}
              className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
            >
              <ClipboardCheck className="h-4 w-4" />
              Return to Completion Packet
            </Link>
          ) : null}
        </div>

        {runError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            QA run read error: {runError.message}
          </div>
        ) : null}

        {checksError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            QA checks read error: {checksError.message}
          </div>
        ) : null}

        {!run ? (
          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 text-center shadow-sm">
            <p className="text-xl font-semibold">
              QA run not found
            </p>
          </section>
        ) : (
          <>
            <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                <ClipboardCheck className="h-4 w-4" />
                QA Run Detail
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                {run.feature_name}
              </h1>

              <div className="mt-5 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(
                    computedStatus
                  )}`}
                >
                  {statusIcon(computedStatus)}
                  Computed: {computedStatus}
                </span>

                <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                  Stored: {run.status}
                </span>

                <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                  {run.project_key}
                </span>

                {run.module_key ? (
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                    {run.module_key}
                  </span>
                ) : null}

                {linkedPacket ? (
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                    Packet: {linkedPacket.status}
                  </span>
                ) : null}
              </div>

              {run.build_session_title ? (
                <p className="mt-5 rounded-2xl bg-[#f5f1ea] px-4 py-3 text-sm font-semibold text-black/70">
                  {run.build_session_title}
                </p>
              ) : (
                <p className="mt-5 rounded-2xl bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-800">
                  No build session title linked yet
                </p>
              )}

              {run.summary ? (
                <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                  {run.summary}
                </p>
              ) : null}

              <form action={completeQaRun} className="mt-6">
                <input
                  type="hidden"
                  name="qa_run_id"
                  value={run.id}
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                >
                  <Save className="h-4 w-4" />
                  Recalculate and Persist QA Status
                </button>
              </form>

              <p className="mt-3 text-xs leading-5 text-black/45">
                A warning blocks completion until it has an explicit reviewer, acknowledgement note, and acknowledgement timestamp. Acknowledged warnings remain visible but may produce an overall pass.
              </p>
            </header>

            {query.error ? (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {query.error}
              </div>
            ) : null}

            {query.success ? (
              <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                {query.success}
              </div>
            ) : null}

            <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
                <ClipboardCheck className="mb-4 h-6 w-6" />
                <p className="text-sm text-black/45">
                  Checks
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {checkList.length}
                </p>
              </div>

              <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
                <CheckCircle2 className="mb-4 h-6 w-6" />
                <p className="text-sm text-black/45">
                  Pass
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {passCount}
                </p>
              </div>

              <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
                <Clock className="mb-4 h-6 w-6" />
                <p className="text-sm text-black/45">N/A</p>
                <p className="mt-2 text-3xl font-semibold">
                  {notApplicableCount}
                </p>
              </div>

              <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
                <AlertTriangle className="mb-4 h-6 w-6" />
                <p className="text-sm text-black/45">
                  Warning
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {warningCount}
                </p>
                <p className="mt-2 text-xs text-black/45">
                  {acknowledgedWarningCount} acknowledged /{" "}
                  {unacknowledgedWarningCount} blocking
                </p>
              </div>

              <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
                <XCircle className="mb-4 h-6 w-6" />
                <p className="text-sm text-black/45">
                  Fail
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {failCount}
                </p>
              </div>

              <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
                <Clock className="mb-4 h-6 w-6" />
                <p className="text-sm text-black/45">
                  Pending
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {pendingCount}
                </p>
              </div>
            </div>

            <section className="grid gap-5">
              {checkList.map((check) => {
                const acknowledged =
                  warningIsAcknowledged(check);

                return (
                  <form
                    key={check.id}
                    action={updateQaCheckResult}
                    className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm"
                  >
                    <input
                      type="hidden"
                      name="qa_run_id"
                      value={run.id}
                    />
                    <input
                      type="hidden"
                      name="check_id"
                      value={check.id}
                    />

                    <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(
                              check.status
                            )}`}
                          >
                            {statusIcon(check.status)}
                            {check.status}
                          </span>

                          <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                            {check.category}
                          </span>

                          <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                            {check.severity}
                          </span>

                          {acknowledged ? (
                            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                              acknowledged non-blocking
                            </span>
                          ) : null}
                        </div>

                        <h2 className="text-2xl font-semibold">
                          {check.check_name}
                        </h2>
                        <p className="mt-2 text-sm text-black/45">
                          {check.check_key}
                        </p>
                      </div>

                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                      >
                        <Save className="h-4 w-4" />
                        Save Check
                      </button>
                    </div>

                    <div className="mb-4 rounded-3xl bg-[#f5f1ea] p-5">
                      <p className="text-sm font-medium">
                        Expected result
                      </p>
                      <p className="mt-2 text-sm leading-6 text-black/60">
                        {check.expected_result ||
                          "No expected result provided."}
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-black/70">
                          Status
                        </label>
                        <select
                          name="status"
                          defaultValue={check.status}
                          className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                        >
                          <option value="pending">
                            pending
                          </option>
                          <option value="not_applicable">
                            not_applicable
                          </option>
                          <option value="pass">
                            pass
                          </option>
                          <option value="warning">
                            warning
                          </option>
                          <option value="fail">
                            fail
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-black/70">
                          Actual result
                        </label>
                        <input
                          name="actual_result"
                          defaultValue={
                            check.actual_result || ""
                          }
                          placeholder="What did you verify?"
                          className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-black/70">
                          Notes / evidence
                        </label>
                        <textarea
                          name="notes"
                          rows={3}
                          defaultValue={check.notes || ""}
                          placeholder="SQL checked, page opened, row updated, before/after values, terminal result, etc."
                          className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                        />
                      </div>

                      <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5 md:col-span-2">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            name="warning_acknowledged"
                            defaultChecked={acknowledged}
                            className="mt-1 h-4 w-4"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-yellow-900">
                              Acknowledge this warning as reviewed and non-blocking
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-yellow-800/75">
                              Used only while the saved status is warning. Changing the status clears acknowledgement evidence automatically.
                            </span>
                          </span>
                        </label>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label>
                            <span className="mb-2 block text-sm font-medium text-yellow-900">
                              Acknowledged by
                            </span>
                            <input
                              name="warning_acknowledged_by"
                              defaultValue={
                                check.warning_acknowledged_by ||
                                ""
                              }
                              placeholder="Reviewer name"
                              className="w-full rounded-2xl border border-yellow-200 bg-white px-4 py-3 outline-none"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-sm font-medium text-yellow-900">
                              Acknowledgement notes
                            </span>
                            <textarea
                              name="warning_acknowledgement_notes"
                              rows={3}
                              defaultValue={
                                check.warning_acknowledgement_notes ||
                                ""
                              }
                              placeholder="Why is this warning acceptable and non-blocking?"
                              className="w-full rounded-2xl border border-yellow-200 bg-white px-4 py-3 outline-none"
                            />
                          </label>
                        </div>

                        {check.warning_acknowledged_at ? (
                          <p className="mt-3 text-xs text-yellow-800/75">
                            Acknowledged at:{" "}
                            {check.warning_acknowledged_at}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </form>
                );
              })}
            </section>
          </>
        )}

        <footer className="py-8 text-center text-sm text-black/40">
          Athena QA Run Detail v2
        </footer>
      </section>
    </main>
  );
}
