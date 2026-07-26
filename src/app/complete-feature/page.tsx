import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  History,
  ShieldAlert,
  TestTube2
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { createQaRun } from "@/app/qa/actions";
import {
  prefillLatestQaChecks,
  recordCtoUpdateFromCompletion,
  saveCompletionPacket
} from "@/app/complete-feature/actions";
import {
  joinPacketLines,
  type CompletionPacket
} from "@/lib/completion-packets";

type CompleteFeaturePageProps = {
  searchParams: Promise<{
    packet_id?: string;
    qa_run_id?: string;
    new?: string;
    project_key?: string;
    module_key?: string;
    feature_type?: string;
    feature_name?: string;
    route_path?: string;
    build_session_title?: string;
    summary?: string;
    completed?: string;
    files_created?: string;
    files_modified?: string;
    decisions?: string;
    hours_spent?: string;
    files_changed?: string;
    database_changes?: string;
    security_notes?: string;
    missing?: string;
    next_steps?: string;
    error?: string;
    success?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  priority: string;
  status: string;
};

type PacketListItem = {
  id: string;
  project_key: string;
  module_key: string;
  feature_name: string;
  build_session_title: string;
  status: string;
  qa_run_id: string | null;
  updated_at: string;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function asMetadataRecord(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function metadataText(
  metadata: Record<string, unknown> | null,
  key: string
) {
  const value = metadata?.[key];

  return typeof value === "string"
    ? value
    : "";
}

function metadataNumberText(
  metadata: Record<string, unknown> | null,
  key: string
) {
  const value = metadata?.[key];

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? String(value)
    : "";
}
function statusClass(status: string) {
  if (status === "completed") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === "ready_to_record") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "retry_ready") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (status === "recording") {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }

  return "border-black/10 bg-black/5 text-black/60";
}

export default async function CompleteFeaturePage({
  searchParams
}: CompleteFeaturePageProps) {
  const query = await searchParams;
  const supabase = createAthenaCoreClient();

  const [{ data: projects }, { data: openPacketRows }] =
    await Promise.all([
      supabase
        .from("athena_projects")
        .select("project_key, name, priority, status")
        .order("priority", { ascending: true })
        .order("name", { ascending: true })
        .returns<Project[]>(),
      supabase
        .from("athena_feature_completion_packets")
        .select(
          "id, project_key, module_key, feature_name, build_session_title, status, qa_run_id, updated_at"
        )
        .in("status", [
          "draft",
          "qa_in_progress",
          "ready_to_record",
          "recording",
          "retry_ready"
        ])
        .order("updated_at", { ascending: false })
        .limit(20)
        .returns<PacketListItem[]>()
    ]);

  const projectOptions = projects || [];
  const openPackets = openPacketRows || [];

  let packet: CompletionPacket | null = null;
  let packetReadError = "";

  const requestedPacketId = clean(query.packet_id);
  const requestedQaRunId = clean(query.qa_run_id);

  if (requestedPacketId) {
    const { data, error } = await supabase
      .from("athena_feature_completion_packets")
      .select("*")
      .eq("id", requestedPacketId)
      .maybeSingle<CompletionPacket>();

    packet = data || null;
    packetReadError =
      error?.message ||
      (!data ? "Completion packet was not found." : "");
  } else if (requestedQaRunId) {
    const { data, error } = await supabase
      .from("athena_feature_completion_packets")
      .select("*")
      .eq("qa_run_id", requestedQaRunId)
      .maybeSingle<CompletionPacket>();

    packet = data || null;
    packetReadError =
      error?.message ||
      (!data
        ? "No completion packet is linked to this QA run."
        : "");
  } else if (query.new !== "1" && openPackets.length > 0) {
    const { data, error } = await supabase
      .from("athena_feature_completion_packets")
      .select("*")
      .eq("id", openPackets[0].id)
      .maybeSingle<CompletionPacket>();

    packet = data || null;
    packetReadError = error?.message || "";
  }

  const projectKey =
    packet?.project_key || clean(query.project_key);
  const moduleKey =
    packet?.module_key || clean(query.module_key);
  const featureType =
    packet?.feature_type ||
    clean(query.feature_type) ||
    "standard_app_feature";
  const featureName =
    packet?.feature_name || clean(query.feature_name);
  const routePath =
    packet?.route_path || clean(query.route_path);
  const buildSessionTitle =
    packet?.build_session_title ||
    clean(query.build_session_title);
  const summary =
    packet?.summary || clean(query.summary);
  const filesChanged = packet
    ? joinPacketLines(packet.files_changed)
    : clean(query.files_changed);
  const completed = packet
    ? joinPacketLines(packet.completed)
    : clean(query.completed);
  const filesCreated = packet
    ? joinPacketLines(packet.files_created)
    : clean(query.files_created);
  const filesModified = packet
    ? joinPacketLines(packet.files_modified)
    : clean(query.files_modified);
  const decisions = packet
    ? joinPacketLines(packet.decisions)
    : clean(query.decisions);

  const databaseChanges = packet
    ? packet.database_changes.length > 0
      ? joinPacketLines(packet.database_changes)
      : "None"
    : clean(query.database_changes) || "None";
  const securityNotes = packet
    ? joinPacketLines(packet.security_notes)
    : clean(query.security_notes);
  const missing = packet
    ? joinPacketLines(packet.missing)
    : clean(query.missing);
  const nextSteps = packet
    ? joinPacketLines(packet.next_steps)
    : clean(query.next_steps);

  const readOnly =
    packet?.status === "completed" ||
    packet?.status === "cancelled";
  const identityLocked = Boolean(packet);
  const qaIdentityLocked = Boolean(packet?.qa_run_id);
  const error =
    clean(query.error) || packetReadError;
  const success = clean(query.success);

  const packetMetadata =
    asMetadataRecord(
      packet?.metadata
    );

  const savedManualHoursFallback =
    asMetadataRecord(
      packetMetadata?.manual_hours_fallback
    );

  const savedManualHoursSpent =
    metadataNumberText(
      savedManualHoursFallback,
      "manual_hours_spent"
    );

  const savedManualHoursReason =
    metadataText(
      savedManualHoursFallback,
      "manual_hours_reason"
    );

  const savedManualHoursEvidence =
    metadataText(
      savedManualHoursFallback,
      "manual_hours_evidence"
    );

  const savedManualHoursOperator =
    metadataText(
      savedManualHoursFallback,
      "manual_hours_operator"
    );

  const savedManualHoursAcknowledged =
    savedManualHoursFallback
      ?.manual_hours_acknowledged === true;
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
            href="/complete-feature?new=1"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ClipboardCheck className="h-4 w-4" />
            New completion packet
          </Link>

          <Link
            href="/qa"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <TestTube2 className="h-4 w-4" />
            QA Center
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <ClipboardCheck className="h-4 w-4" />
            Athena Completion Workflow
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Persistent Completion Packet
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Save once, return from QA without losing data, and record Athena CTO from one verified packet identity.
          </p>

          {packet ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(
                  packet.status
                )}`}
              >
                {packet.status}
              </span>
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                Packet {packet.id}
              </span>
              {packet.qa_run_id ? (
                <Link
                  href={`/qa/${packet.qa_run_id}`}
                  className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white"
                >
                  Open QA run
                </Link>
              ) : null}
            </div>
          ) : null}
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        ) : null}

        {openPackets.length > 0 ? (
          <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5" />
              <h2 className="text-xl font-semibold">
                Open completion packets
              </h2>
            </div>

            <div className="grid gap-3">
              {openPackets.map((openPacket) => (
                <Link
                  key={openPacket.id}
                  href={`/complete-feature?packet_id=${openPacket.id}`}
                  className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 transition hover:bg-[#f5f1ea]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass(
                        openPacket.status
                      )}`}
                    >
                      {openPacket.status}
                    </span>
                    <span className="text-xs text-black/45">
                      {openPacket.project_key}/
                      {openPacket.module_key}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold">
                    {openPacket.build_session_title}
                  </p>
                  <p className="mt-1 text-sm text-black/55">
                    {openPacket.feature_name}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <h2 className="mb-2 text-3xl font-semibold">
            {packet
              ? "Saved packet fields"
              : "Create completion packet"}
          </h2>
          <p className="mb-5 text-sm leading-6 text-black/55">
            Project and build-session identity become immutable after the first save. QA-linked identity fields also become immutable.
          </p>

          <form
            action={saveCompletionPacket}
            className="grid gap-4 md:grid-cols-2"
          >
            {packet ? (
              <input
                type="hidden"
                name="packet_id"
                value={packet.id}
              />
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Project
              </label>
              {identityLocked ? (
                <>
                  <input
                    type="hidden"
                    name="project_key"
                    value={projectKey}
                  />
                  <div className="rounded-2xl border border-black/10 bg-[#f5f1ea] px-4 py-3">
                    {projectKey}
                  </div>
                </>
              ) : (
                <select
                  name="project_key"
                  defaultValue={projectKey}
                  required
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                >
                  <option value="">
                    Select canonical project
                  </option>
                  {projectOptions.map((project) => (
                    <option
                      key={project.project_key}
                      value={project.project_key}
                    >
                      {project.name} | {project.priority} |{" "}
                      {project.status}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Module key
              </label>
              {qaIdentityLocked || readOnly ? (
                <>
                  <input
                    type="hidden"
                    name="module_key"
                    value={moduleKey}
                  />
                  <div className="rounded-2xl border border-black/10 bg-[#f5f1ea] px-4 py-3">
                    {moduleKey}
                  </div>
                </>
              ) : (
                <input
                  name="module_key"
                  defaultValue={moduleKey}
                  placeholder="build-log-recorder"
                  required
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                />
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Feature type
              </label>
              {qaIdentityLocked || readOnly ? (
                <>
                  <input
                    type="hidden"
                    name="feature_type"
                    value={featureType}
                  />
                  <div className="rounded-2xl border border-black/10 bg-[#f5f1ea] px-4 py-3">
                    {featureType}
                  </div>
                </>
              ) : (
                <select
                  name="feature_type"
                  defaultValue={featureType}
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                >
                  <option value="standard_app_feature">
                    standard_app_feature
                  </option>
                  <option value="read_only_ui">
                    read_only_ui
                  </option>
                  <option value="homepage_shortcut">
                    homepage_shortcut
                  </option>
                  <option value="database_registry_change">
                    database_registry_change
                  </option>
                </select>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Feature name
              </label>
              {qaIdentityLocked || readOnly ? (
                <>
                  <input
                    type="hidden"
                    name="feature_name"
                    value={featureName}
                  />
                  <div className="rounded-2xl border border-black/10 bg-[#f5f1ea] px-4 py-3">
                    {featureName}
                  </div>
                </>
              ) : (
                <input
                  name="feature_name"
                  defaultValue={featureName}
                  required
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                />
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Build session title
              </label>
              {identityLocked ? (
                <>
                  <input
                    type="hidden"
                    name="build_session_title"
                    value={buildSessionTitle}
                  />
                  <div className="rounded-2xl border border-black/10 bg-[#f5f1ea] px-4 py-3">
                    {buildSessionTitle}
                  </div>
                </>
              ) : (
                <input
                  name="build_session_title"
                  defaultValue={buildSessionTitle}
                  required
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                />
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Route path
              </label>
              {qaIdentityLocked || readOnly ? (
                <>
                  <input
                    type="hidden"
                    name="route_path"
                    value={routePath}
                  />
                  <div className="rounded-2xl border border-black/10 bg-[#f5f1ea] px-4 py-3">
                    {routePath || "None"}
                  </div>
                </>
              ) : (
                <input
                  name="route_path"
                  defaultValue={routePath}
                  placeholder="/complete-feature"
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                />
              )}
            </div>

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-black/70">
                Summary
              </span>
              <textarea
                name="summary"
                rows={3}
                defaultValue={summary}
                readOnly={readOnly}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black read-only:bg-[#f5f1ea]"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-medium text-black/70">
                Files changed
              </span>
              <textarea
                name="files_changed"
                rows={4}
                defaultValue={filesChanged}
                readOnly={readOnly}
                placeholder="One file per line"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 font-mono text-xs outline-none focus:border-black read-only:bg-[#f5f1ea]"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-medium text-black/70">
                Database changes
              </span>
              <textarea
                name="database_changes"
                rows={4}
                defaultValue={databaseChanges}
                readOnly={readOnly}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black read-only:bg-[#f5f1ea]"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-medium text-black/70">
                Security notes
              </span>
              <textarea
                name="security_notes"
                rows={4}
                defaultValue={securityNotes}
                readOnly={readOnly}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black read-only:bg-[#f5f1ea]"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-medium text-black/70">
                Missing
              </span>
              <textarea
                name="missing"
                rows={4}
                defaultValue={missing}
                readOnly={readOnly}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black read-only:bg-[#f5f1ea]"
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-black/70">
                Next steps
              </span>
              <textarea
                name="next_steps"
                rows={4}
                defaultValue={nextSteps}
                readOnly={readOnly}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black read-only:bg-[#f5f1ea]"
              />
            </label>

            {!readOnly ? (
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85 md:col-span-2"
              >
                <ClipboardCheck className="h-4 w-4" />
                {packet
                  ? "Save and verify packet"
                  : "Create and verify packet"}
              </button>
            ) : null}
          </form>
        </section>

        {packet ? (
          <section className="grid gap-6 lg:grid-cols-3">
            <article className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                <TestTube2 className="h-3 w-3" />
                Step 1
              </div>
              <h2 className="text-2xl font-semibold">
                QA run
              </h2>

              {packet.qa_run_id ? (
                <>
                  <Link
                    href={`/qa/${packet.qa_run_id}`}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white"
                  >
                    <TestTube2 className="h-4 w-4" />
                    Open linked QA run
                  </Link>

                  {!readOnly ? (
                    <form
                      action={prefillLatestQaChecks}
                      className="mt-3"
                    >
                      <input
                        type="hidden"
                        name="packet_id"
                        value={packet.id}
                      />
                      <button
                        type="submit"
                        className="inline-flex w-full items-center justify-center rounded-2xl border border-black/10 bg-[#fbfaf7] px-5 py-4 text-sm font-medium"
                      >
                        Prefill and reset QA evidence
                      </button>
                    </form>
                  ) : null}
                </>
              ) : readOnly ? (
                <p className="mt-4 text-sm text-black/55">
                  No QA run is linked.
                </p>
              ) : (
                <form
                  action={createQaRun}
                  className="mt-4"
                >
                  <input
                    type="hidden"
                    name="packet_id"
                    value={packet.id}
                  />
                  <input
                    type="hidden"
                    name="template_key"
                    value="athena-feature-completion-gate-v1"
                  />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white"
                  >
                    <TestTube2 className="h-4 w-4" />
                    Create QA run from packet
                  </button>
                </form>
              )}
            </article>

            <article className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                <FileText className="h-3 w-3" />
                Step 2
              </div>
              <h2 className="text-2xl font-semibold">
                CTO recording
              </h2>

              {readOnly ? (
                <div className="mt-4 space-y-3 text-sm">
                  <p>
                    <strong>Hours spent:</strong>{" "}
                    {packet.hours_spent ?? "Not recorded"}
                  </p>
                  <p>
                    <strong>
                      Remaining-hours snapshot:
                    </strong>{" "}
                    {packet.estimated_remaining_hours_snapshot ??
                      "Not recorded"}
                  </p>
                  <p>
                    <strong>Build log:</strong>{" "}
                    {packet.build_log_id || "Not linked"}
                  </p>
                </div>
              ) : (
                <form
                  action={recordCtoUpdateFromCompletion}
                  className="mt-4 space-y-4"
                >
                  <input
                    type="hidden"
                    name="packet_id"
                    value={packet.id}
                  />

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">
                      Completed work
                    </span>
                    <textarea
                      name="completed"
                      defaultValue={completed}
                      required
                      rows={7}
                      placeholder="One verified item per line"
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">
                      Files created
                    </span>
                    <textarea
                      name="files_created"
                      defaultValue={filesCreated}
                      rows={5}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 font-mono text-xs"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">
                      Files modified
                    </span>
                    <textarea
                      name="files_modified"
                      defaultValue={filesModified}
                      rows={5}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 font-mono text-xs"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">
                      Decisions
                    </span>
                    <textarea
                      name="decisions"
                      defaultValue={decisions}
                      rows={5}
                      className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm"
                    />
                  </label>

                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    <p className="font-medium">
                      Canonical timer hours
                    </p>
                    <p className="mt-2 leading-6">
                      Athena first resolves hours server-side from the exact stopped timer matching the packet project, module, build session title, and signed operator.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-blue-700">
                      When a valid stopped timer exists, it remains authoritative and all manual-hours fields below are ignored.
                    </p>
                  </div>

                  <details
                    open={Boolean(savedManualHoursFallback)}
                    className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900"
                  >
                    <summary className="cursor-pointer font-semibold">
                      Audited manual-hours fallback
                    </summary>

                    <p className="mt-3 leading-6 text-yellow-900/80">
                      Use this only when Athena cannot find a valid stopped timer for the exact packet identity. Manual hours require a reason, evidence, operator acknowledgement, and a visible QA warning.
                    </p>

                    {savedManualHoursFallback ? (
                      <p className="mt-3 rounded-xl border border-yellow-200 bg-white px-3 py-2 text-xs leading-5 text-yellow-800">
                        Previously submitted manual fallback evidence was loaded from the saved completion packet.
                      </p>
                    ) : null}

                    <div className="mt-4 grid gap-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">
                          Manual hours spent
                        </span>
                        <input
                          type="number"
                          name="manual_hours_spent"
                          min="0"
                          step="0.01"
                          defaultValue={savedManualHoursSpent}
                          placeholder="0.00"
                          className="w-full rounded-2xl border border-yellow-200 bg-white px-4 py-3 outline-none focus:border-yellow-500"
                        />
                        <span className="mt-2 block text-xs leading-5 text-yellow-800/75">
                          Required only when no valid stopped timer exists. Maximum two decimal places.
                        </span>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">
                          Manual-hours reason
                        </span>
                        <textarea
                          name="manual_hours_reason"
                          rows={3}
                          defaultValue={savedManualHoursReason}
                          placeholder="Explain why canonical timer evidence is unavailable."
                          className="w-full rounded-2xl border border-yellow-200 bg-white px-4 py-3 outline-none focus:border-yellow-500"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">
                          Manual-hours evidence
                        </span>
                        <textarea
                          name="manual_hours_evidence"
                          rows={4}
                          defaultValue={savedManualHoursEvidence}
                          placeholder="Provide terminal logs, timestamps, task records, commits, screenshots, or other verifiable evidence."
                          className="w-full rounded-2xl border border-yellow-200 bg-white px-4 py-3 outline-none focus:border-yellow-500"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">
                          Operator acknowledgement name
                        </span>
                        <input
                          name="manual_hours_operator"
                          defaultValue={savedManualHoursOperator}
                          placeholder="Operator or reviewer name"
                          className="w-full rounded-2xl border border-yellow-200 bg-white px-4 py-3 outline-none focus:border-yellow-500"
                        />
                      </label>

                      <label className="flex items-start gap-3 rounded-2xl border border-yellow-200 bg-white p-4">
                        <input
                          type="checkbox"
                          name="manual_hours_acknowledged"
                          defaultChecked={savedManualHoursAcknowledged}
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <span className="block font-semibold">
                            I acknowledge the manual-hours governance warning
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-yellow-800/75">
                            I understand that manual hours create or update a visible QA warning. Completion remains blocked until that warning has an explicit reviewer, acknowledgement note, and acknowledgement timestamp.
                          </span>
                        </span>
                      </label>
                    </div>
                  </details>

                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white"
                  >
                    <FileText className="h-4 w-4" />
                    {packet.status === "retry_ready" ||
                    packet.status === "recording"
                      ? "Resume and verify CTO recording"
                      : "Record and verify CTO update"}
                  </button>
                </form>
              )}
            </article>

            <article className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                <Database className="h-3 w-3" />
                Step 3
              </div>
              <h2 className="text-2xl font-semibold">
                Verified links
              </h2>

              <div className="mt-4 space-y-3 break-all text-sm text-black/65">
                <p>
                  <strong>Packet:</strong> {packet.id}
                </p>
                <p>
                  <strong>QA run:</strong>{" "}
                  {packet.qa_run_id || "Not linked"}
                </p>
                <p>
                  <strong>Completion event:</strong>{" "}
                  {packet.completion_event_id ||
                    "Not linked"}
                </p>
                <p>
                  <strong>Build log:</strong>{" "}
                  {packet.build_log_id || "Not linked"}
                </p>
                <p>
                  <strong>Completed at:</strong>{" "}
                  {packet.completed_at || "Not completed"}
                </p>
              </div>

              {packet.status === "completed" ? (
                <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  <CheckCircle2 className="mb-2 h-5 w-5" />
                  Packet is read-only because all required records were linked and verified.
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  <ShieldAlert className="mb-2 h-5 w-5" />
                  Completion remains open until QA, build log, completion event, and packet links verify.
                </div>
              )}
            </article>
          </section>
        ) : (
          <section className="rounded-[2.5rem] border border-dashed border-black/15 bg-white p-8 text-center shadow-sm">
            <ShieldAlert className="mx-auto mb-4 h-8 w-8 text-black/35" />
            <h2 className="text-2xl font-semibold">
              No saved packet selected
            </h2>
            <p className="mt-3 text-black/55">
              Enter the canonical feature fields and save the packet before creating QA.
            </p>
          </section>
        )}

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Persistent Feature Completion Command Center
        </footer>
      </section>
    </main>
  );
}
