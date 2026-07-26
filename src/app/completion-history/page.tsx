import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  Filter,
  History,
  Search,
  ShieldAlert
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { repairCompletionEvent } from "@/app/completion-history/actions";

type CompletionHistoryPageProps = {
  searchParams: Promise<{
    q?: string;
    project_key?: string;
    status?: string;
    recorded?: string;
    message?: string;
    error?: string;
  }>;
};

type CompletionEvent = {
  id: string;
  project_key: string;
  module_key: string | null;
  feature_name: string;
  build_session_title: string;
  route_path: string | null;
  qa_run_id: string | null;
  status: string;
  cto_recorded: boolean;
  memory_check_closed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function statusBadge(status: string) {
  if (status === "completed") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === "recording") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (status === "blocked" || status === "failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "retry_ready") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "needs_review") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  return "border-black/10 bg-black/5 text-black/60";
}

function boolBadge(value: boolean) {
  return value
    ? "border-green-200 bg-green-50 text-green-700"
    : "border-yellow-200 bg-yellow-50 text-yellow-800";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function CompletionHistoryPage({
  searchParams
}: CompletionHistoryPageProps) {
  const query = await searchParams;

  const searchTerm = clean(query.q).toLowerCase();
  const projectFilter = clean(query.project_key);
  const statusFilter = clean(query.status);
  const recordedFilter = clean(query.recorded);

  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase
    .from("athena_feature_completion_events")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<CompletionEvent[]>();

  const allEvents = data || [];

  const projectKeys = Array.from(
    new Set(allEvents.map((event) => event.project_key).filter(Boolean))
  ).sort();

  const statusOptions = Array.from(
    new Set(allEvents.map((event) => event.status).filter(Boolean))
  ).sort();

  const events = allEvents.filter((event) => {
    const searchableText = [
      event.feature_name,
      event.build_session_title,
      event.project_key,
      event.module_key || "",
      event.route_path || "",
      event.notes || ""
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchTerm ? searchableText.includes(searchTerm) : true;
    const matchesProject = projectFilter ? event.project_key === projectFilter : true;
    const matchesStatus = statusFilter ? event.status === statusFilter : true;

    const matchesRecorded =
      recordedFilter === "cto_recorded"
        ? event.cto_recorded
        : recordedFilter === "cto_not_recorded"
          ? !event.cto_recorded
          : recordedFilter === "memory_closed"
            ? event.memory_check_closed
            : recordedFilter === "memory_open"
              ? !event.memory_check_closed
              : true;

    return matchesSearch && matchesProject && matchesStatus && matchesRecorded;
  });

  const totalEvents = events.length;
  const completedEvents = events.filter((event) => event.status === "completed").length;
  const ctoRecorded = events.filter((event) => event.cto_recorded).length;
  const memoryClosed = events.filter((event) => event.memory_check_closed).length;
  const incompleteEvents = events.filter(
    (event) => !event.cto_recorded || !event.memory_check_closed || event.status !== "completed"
  ).length;

  const filterCount = [
    searchTerm,
    projectFilter,
    statusFilter,
    recordedFilter
  ].filter(Boolean).length;

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
            href="/complete-feature"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ClipboardCheck className="h-4 w-4" />
            Complete Feature
          </Link>

          <Link
            href="/qa"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <CheckCircle2 className="h-4 w-4" />
            QA Center
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <History className="h-4 w-4" />
            Athena Completion History
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Feature Completion History
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Search and filter features completed through the Feature Completion Command Center. Use this page to confirm what was recorded, what closed automatically, and what still needs attention.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Completion history read error: {error.message}
          </div>
        ) : null}

        {clean(query.error) ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {clean(query.error)}
          </div>
        ) : null}

        {clean(query.message) ? (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {clean(query.message)}
          </div>
        ) : null}

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-black/45">Search and filters</p>
              <h2 className="text-3xl font-semibold">Find completed work</h2>
            </div>

            {filterCount > 0 ? (
              <Link
                href="/completion-history"
                className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#f5f1ea]"
              >
                Clear filters
              </Link>
            ) : null}
          </div>

          <form action="/completion-history" method="get" className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                <input
                  name="q"
                  defaultValue={clean(query.q)}
                  placeholder="Feature, build session, route, notes..."
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] py-3 pl-11 pr-4 outline-none focus:border-black"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Project
              </label>
              <select
                name="project_key"
                defaultValue={projectFilter}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="">All projects</option>
                {projectKeys.map((projectKey) => (
                  <option key={projectKey} value={projectKey}>
                    {projectKey}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Status
              </label>
              <select
                name="status"
                defaultValue={statusFilter}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Recording state
              </label>
              <select
                name="recorded"
                defaultValue={recordedFilter}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="">All</option>
                <option value="cto_recorded">CTO recorded</option>
                <option value="cto_not_recorded">CTO not recorded</option>
                <option value="memory_closed">Memory closed</option>
                <option value="memory_open">Memory open</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
              >
                <Filter className="h-4 w-4" />
                Apply
              </button>
            </div>
          </form>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-5">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <History className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Visible events</p>
            <p className="mt-2 text-3xl font-semibold">{totalEvents}</p>
            <p className="mt-1 text-xs text-black/35">{allEvents.length} total saved</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <CheckCircle2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Completed</p>
            <p className="mt-2 text-3xl font-semibold">{completedEvents}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Database className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">CTO recorded</p>
            <p className="mt-2 text-3xl font-semibold">{ctoRecorded}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ShieldAlert className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Memory closed</p>
            <p className="mt-2 text-3xl font-semibold">{memoryClosed}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <AlertTriangle className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Needs attention</p>
            <p className="mt-2 text-3xl font-semibold">{incompleteEvents}</p>
          </div>
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Recorded completion events</p>
            <h2 className="text-3xl font-semibold">History</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">
              Duplicate protection uses project key + build session title. If a feature appears here as completed, avoid recording the same build session again.
            </p>
          </div>

          {events.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No matching completion events</p>
              <p className="mt-2 text-sm text-black/55">
                Clear the filters or complete a feature through /complete-feature.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(event.status)}`}>
                      {event.status}
                    </span>

                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${boolBadge(event.cto_recorded)}`}>
                      CTO {event.cto_recorded ? "recorded" : "not recorded"}
                    </span>

                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${boolBadge(event.memory_check_closed)}`}>
                      Memory {event.memory_check_closed ? "closed" : "open"}
                    </span>

                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {event.project_key}
                    </span>

                    {event.module_key ? (
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {event.module_key}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
                    <div>
                      <h3 className="text-2xl font-semibold">{event.feature_name}</h3>

                      <p className="mt-2 break-words font-mono text-xs text-black/40">
                        {event.build_session_title}
                      </p>

                      {event.route_path ? (
                        <p className="mt-3 rounded-2xl bg-white px-4 py-3 font-mono text-xs text-black/60">
                          {event.route_path}
                        </p>
                      ) : null}

                      {event.notes ? (
                        <p className="mt-4 text-sm leading-6 text-black/60">
                          {event.notes}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-3xl bg-white p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-black/45" />
                        <p className="text-sm font-medium">Timeline</p>
                      </div>

                      <div className="space-y-3 text-sm text-black/60">
                        <p>
                          <span className="font-medium text-black">Created:</span>{" "}
                          {formatDate(event.created_at)}
                        </p>
                        <p>
                          <span className="font-medium text-black">Updated:</span>{" "}
                          {formatDate(event.updated_at)}
                        </p>

                        {event.qa_run_id ? (
                          <Link
                            href={`/qa/${event.qa_run_id}`}
                            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                          >
                            Open QA Run
                          </Link>
                        ) : (
                          <p className="mt-4 rounded-2xl bg-yellow-50 px-4 py-3 text-yellow-800">
                            No QA run linked.
                          </p>
                        )}

                        {event.status !== "completed" || !event.cto_recorded || !event.memory_check_closed ? (
                          <div className="mt-4 space-y-3 rounded-3xl border border-yellow-200 bg-yellow-50 p-4">
                            <p className="text-sm font-medium text-yellow-900">
                              Repair workflow
                            </p>

                            <form action={repairCompletionEvent}>
                              <input type="hidden" name="event_id" value={event.id} />

                              <button
                                type="submit"
                                className="inline-flex w-full items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                              >
                                Repair / Prepare Retry
                              </button>
                            </form>

                            <Link
                              href={`/complete-feature?project_key=${encodeURIComponent(event.project_key)}&module_key=${encodeURIComponent(event.module_key || "")}&feature_name=${encodeURIComponent(event.feature_name)}&build_session_title=${encodeURIComponent(event.build_session_title)}&route_path=${encodeURIComponent(event.route_path || "")}`}
                              className="inline-flex w-full items-center justify-center rounded-2xl border border-yellow-200 bg-white px-4 py-3 text-sm font-medium text-yellow-900 transition hover:bg-yellow-100"
                            >
                              Open Completion Packet
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Feature Completion History v2
        </footer>
      </section>
    </main>
  );
}