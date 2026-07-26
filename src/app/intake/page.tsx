import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Filter,
  Inbox,
  PackageCheck,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import {
  createAthenaIntakeItem,
  createAthenaIntakePreparationPackage,
  ingestAthenaConversationCandidate,
  reviewAthenaIntakeItem
} from "./actions";

type IntakePageProps = {
  searchParams: Promise<{
    project_key?: string;
    error?: string;
    success?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  status: string;
  priority: string;
};

type ProjectModule = {
  project_key: string;
  module_key: string;
  name: string;
  status: string;
  priority: string;
};

type IntakeStatus = {
  status_key: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_initial: boolean;
  review_outcome: string | null;
  allows_preparation: boolean;
  is_terminal: boolean;
  is_active: boolean;
};

type IntakeItem = {
  id: string;
  intake_key: string;
  project_key: string;
  module_key: string;
  title: string;
  description: string;
  source_type: string;
  source_reference: string | null;
  submitted_by: string | null;
  status_key: string;
  created_at: string;
  updated_at: string;
};

type ReviewHistory = {
  id: string;
  intake_id: string;
  from_status_key: string;
  to_status_key: string;
  review_outcome: string;
  reviewed_by: string;
  decision_notes: string;
  created_at: string;
};

type PreparationPackage = {
  id: string;
  package_key: string;
  intake_id: string;
  project_key: string;
  module_key: string;
  package_title: string;
  proposed_build_id: string | null;
  proposed_build_title: string | null;
  objective: string;
  acceptance_criteria: string[];
  dependencies: string[];
  risks: string[];
  security_notes: string[];
  missing_information: string[];
  created_at: string;
  updated_at: string;
};

function clean(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusTone(status: IntakeStatus | undefined) {
  if (!status) {
    return "border-black/10 bg-black/5 text-black/60";
  }

  if (status.is_initial) {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }

  if (status.allows_preparation) {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }

  if (status.is_terminal) {
    return "border-rose-300 bg-rose-50 text-rose-900";
  }

  return "border-black/10 bg-black/5 text-black/60";
}

function TextField({
  name,
  label,
  placeholder,
  required = false
}: {
  name: string;
  label: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-black/70">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none transition focus:border-black"
      />
    </label>
  );
}

function TextAreaField({
  name,
  label,
  placeholder,
  required = false,
  rows = 4,
  lineList = false
}: {
  name: string;
  label: string;
  placeholder: string;
  required?: boolean;
  rows?: number;
  lineList?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-black/70">
        {label}
        {required ? " *" : ""}
      </span>
      <textarea
        name={name}
        required={required}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none transition focus:border-black"
      />
      {lineList ? (
        <span className="mt-1 block text-xs text-black/40">
          Enter one item per line.
        </span>
      ) : null}
    </label>
  );
}

function ListBlock({
  title,
  values
}: {
  title: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/40">
        {title}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-black/70">
        {values.map((value) => (
          <li key={value}>• {value}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function IntakePage({
  searchParams
}: IntakePageProps) {
  const query = await searchParams;
  const requestedProjectKey = clean(query.project_key);
  const supabase = createAthenaCoreClient();

  const [
    projectResult,
    moduleResult,
    statusResult,
    intakeResult,
    reviewResult,
    packageResult
  ] = await Promise.all([
    supabase
      .from("athena_projects")
      .select("project_key, name, status, priority")
      .order("priority", { ascending: true })
      .order("name", { ascending: true })
      .returns<Project[]>(),
    supabase
      .from("athena_project_modules")
      .select("project_key, module_key, name, status, priority")
      .neq("status", "archived")
      .order("project_key", { ascending: true })
      .order("priority", { ascending: true })
      .order("name", { ascending: true })
      .returns<ProjectModule[]>(),
    supabase
      .from("athena_intake_statuses")
      .select(
        "status_key, name, description, sort_order, is_initial, review_outcome, allows_preparation, is_terminal, is_active"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .returns<IntakeStatus[]>(),
    supabase
      .from("athena_intake_items")
      .select(
        "id, intake_key, project_key, module_key, title, description, source_type, source_reference, submitted_by, status_key, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<IntakeItem[]>(),
    supabase
      .from("athena_intake_review_history")
      .select(
        "id, intake_id, from_status_key, to_status_key, review_outcome, reviewed_by, decision_notes, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<ReviewHistory[]>(),
    supabase
      .from("athena_intake_preparation_packages")
      .select(
        "id, package_key, intake_id, project_key, module_key, package_title, proposed_build_id, proposed_build_title, objective, acceptance_criteria, dependencies, risks, security_notes, missing_information, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<PreparationPackage[]>()
  ]);

  const projects = projectResult.data || [];
  const modules = moduleResult.data || [];
  const statuses = statusResult.data || [];
  const allIntakeItems = intakeResult.data || [];
  const reviewHistory = reviewResult.data || [];
  const preparationPackages = packageResult.data || [];

  const selectedProjectKey = projects.some(
    (project) => project.project_key === requestedProjectKey
  )
    ? requestedProjectKey
    : "";

  const selectedProject = projects.find(
    (project) => project.project_key === selectedProjectKey
  );

  const selectedModules = selectedProjectKey
    ? modules.filter(
        (projectModule) =>
          projectModule.project_key === selectedProjectKey
      )
    : [];

  const displayedItems = selectedProjectKey
    ? allIntakeItems.filter(
        (item) => item.project_key === selectedProjectKey
      )
    : allIntakeItems;

  const projectMap = new Map(
    projects.map((project) => [project.project_key, project])
  );
  const moduleMap = new Map(
    modules.map((projectModule) => [
      `${projectModule.project_key}:${projectModule.module_key}`,
      projectModule
    ])
  );
  const statusMap = new Map(
    statuses.map((status) => [status.status_key, status])
  );
  const packageMap = new Map(
    preparationPackages.map((itemPackage) => [
      itemPackage.intake_id,
      itemPackage
    ])
  );

  const historyMap = new Map<string, ReviewHistory[]>();
  for (const historyItem of reviewHistory) {
    const current = historyMap.get(historyItem.intake_id) || [];
    current.push(historyItem);
    historyMap.set(historyItem.intake_id, current);
  }

  const decisionStatuses = statuses.filter(
    (status) => status.review_outcome !== null
  );

  const pendingCount = displayedItems.filter(
    (item) => statusMap.get(item.status_key)?.is_initial
  ).length;
  const approvedCount = displayedItems.filter(
    (item) => statusMap.get(item.status_key)?.allows_preparation
  ).length;
  const deniedCount = displayedItems.filter((item) => {
    const status = statusMap.get(item.status_key);
    return Boolean(
      status?.is_terminal &&
        !status.allows_preparation &&
        status.review_outcome
    );
  }).length;
  const preparedCount = displayedItems.filter((item) =>
    packageMap.has(item.id)
  ).length;

  const loadErrors = [
    projectResult.error,
    moduleResult.error,
    statusResult.error,
    intakeResult.error,
    reviewResult.error,
    packageResult.error
  ]
    .filter(Boolean)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));

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

        <header className="rounded-[2rem] border border-black/10 bg-white/80 p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-black px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
                <Inbox className="h-3.5 w-3.5" />
                ATHENA-INTAKE-0001
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Canonical Intake Workflow
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">
                Capture work requests, review them once, approve or deny them,
                and prepare approved work without automatically creating build
                cards, QA runs, completion events, or next-step records.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                Operator protected
              </div>
              <p className="mt-1 text-xs text-emerald-800/80">
                Projects, modules, and statuses load from canonical database
                registries.
              </p>
            </div>
          </div>
        </header>

        {query.success ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            {query.success}
          </div>
        ) : null}

        {query.error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            {query.error}
          </div>
        ) : null}

        {loadErrors.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <p className="font-semibold">Some intake data could not load.</p>
            <ul className="mt-2 space-y-1">
              {loadErrors.map((message) => (
                <li key={message}>• {message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Pending review",
              value: pendingCount,
              icon: ClipboardList
            },
            {
              label: "Approved",
              value: approvedCount,
              icon: CheckCircle2
            },
            {
              label: "Denied",
              value: deniedCount,
              icon: XCircle
            },
            {
              label: "Prepared",
              value: preparedCount,
              icon: PackageCheck
            }
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <article
                key={metric.label}
                className="rounded-3xl border border-black/10 bg-white/80 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-black/55">
                    {metric.label}
                  </p>
                  <Icon className="h-5 w-5 text-black/45" />
                </div>
                <p className="mt-3 text-3xl font-bold">{metric.value}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-6 rounded-[2rem] border border-black/10 bg-white/80 p-6">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h2 className="text-xl font-bold">Project scope</h2>
          </div>
          <p className="mt-2 text-sm text-black/55">
            Select a canonical project before capturing a new intake item.
            Leaving the filter blank shows recent intake items from all
            projects.
          </p>

          <form method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select
              name="project_key"
              defaultValue={selectedProjectKey}
              className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
            >
              <option value="">All projects / select a project</option>
              {projects.map((project) => (
                <option
                  key={project.project_key}
                  value={project.project_key}
                >
                  {project.name} · {project.project_key} · {project.status}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-black/80"
            >
              Apply project scope
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-[2rem] border border-black/10 bg-white/80 p-6">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            <h2 className="text-xl font-bold">Capture intake item</h2>
          </div>

          {!selectedProject ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Choose a project in Project scope before creating an intake item.
              No project or module default is inferred.
            </div>
          ) : selectedModules.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {selectedProject.name} has no active canonical modules. Intake
              creation is blocked until a module exists in
              public.athena_project_modules.
            </div>
          ) : (
            <form action={createAthenaIntakeItem} className="mt-5 space-y-5">
              <input
                type="hidden"
                name="project_key"
                value={selectedProject.project_key}
              />

              <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">
                  Canonical project
                </p>
                <p className="mt-1 font-semibold">
                  {selectedProject.name}
                  <span className="ml-2 font-mono text-xs text-black/45">
                    {selectedProject.project_key}
                  </span>
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-black/70">
                  Canonical module *
                </span>
                <select
                  name="module_key"
                  required
                  defaultValue=""
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                >
                  <option value="" disabled>
                    Select a module
                  </option>
                  {selectedModules.map((projectModule) => (
                    <option
                      key={projectModule.module_key}
                      value={projectModule.module_key}
                    >
                      {projectModule.name} · {projectModule.module_key} ·{" "}
                      {projectModule.status}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-5 lg:grid-cols-2">
                <TextField
                  name="title"
                  label="Title"
                  placeholder="Concise request or idea title"
                  required
                />
                <TextField
                  name="source_type"
                  label="Source type"
                  placeholder="For example: chat, note, request, audit"
                  required
                />
              </div>

              <TextAreaField
                name="description"
                label="Description"
                placeholder="Describe the need, expected result, constraints, and relevant context."
                required
                rows={6}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <TextField
                  name="source_reference"
                  label="Source reference"
                  placeholder="Optional URL, chat title, document name, or external key"
                />
                <TextField
                  name="submitted_by"
                  label="Submitted by"
                  placeholder="Optional operator or source name"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-black/80"
              >
                <Inbox className="h-4 w-4" />
                Capture for review
              </button>
            </form>
          )}
        </section>

        <section className="mt-6 rounded-[2rem] border border-black/10 bg-white/80 p-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            <h2 className="text-xl font-bold">
              Conversation research ingestion
            </h2>
          </div>
          <p className="mt-2 text-sm text-black/55">
            Paste text from a user-supplied or explicitly authorized source,
            then record one normalized candidate with its supporting evidence.
            Every new candidate remains pending review. This form never
            approves, denies, prepares, prioritizes, or creates a build.
          </p>

          {!selectedProject ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Choose a canonical project before ingesting conversation
              research. No ownership is inferred.
            </div>
          ) : selectedModules.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {selectedProject.name} has no active canonical modules.
              Conversation ingestion is blocked.
            </div>
          ) : (
            <form
              action={ingestAthenaConversationCandidate}
              className="mt-5 space-y-5"
            >
              <input
                type="hidden"
                name="project_key"
                value={selectedProject.project_key}
              />

              <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">
                  Canonical project
                </p>
                <p className="mt-1 font-semibold">
                  {selectedProject.name}
                  <span className="ml-2 font-mono text-xs text-black/45">
                    {selectedProject.project_key}
                  </span>
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-black/70">
                    Canonical module *
                  </span>
                  <select
                    name="module_key"
                    required
                    defaultValue=""
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  >
                    <option value="" disabled>
                      Select a module
                    </option>
                    {selectedModules.map((projectModule) => (
                      <option
                        key={projectModule.module_key}
                        value={projectModule.module_key}
                      >
                        {projectModule.name} / {projectModule.module_key} /{" "}
                        {projectModule.status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-black/70">
                    Authorized source type *
                  </span>
                  <select
                    name="source_type"
                    required
                    defaultValue="pasted_conversation"
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  >
                    <option value="pasted_conversation">
                      Pasted conversation
                    </option>
                    <option value="chatgpt_export">
                      User-supplied ChatGPT export
                    </option>
                    <option value="project_chat_summary">
                      Project-chat summary
                    </option>
                    <option value="uploaded_source_file">
                      Uploaded source file
                    </option>
                    <option value="authorized_connector_source">
                      Authorized connector source
                    </option>
                  </select>
                </label>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <TextField
                  name="source_reference"
                  label="Source reference"
                  placeholder="Chat title, export name, uploaded filename, or authorized source key"
                  required
                />
                <TextField
                  name="submitted_by"
                  label="Submitted by"
                  placeholder="Optional operator or source owner"
                />
              </div>

              <TextAreaField
                name="evidence_text"
                label="Supporting source text"
                placeholder="Paste the exact conversation, excerpt, summary, or authorized source text supporting this candidate."
                required
                rows={10}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <TextField
                  name="title"
                  label="Normalized candidate title"
                  placeholder="Concise feature, improvement, decision, risk, or unresolved idea"
                  required
                />

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-black/70">
                    Candidate category *
                  </span>
                  <select
                    name="candidate_category"
                    required
                    defaultValue=""
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    <option value="feature_request">Feature request</option>
                    <option value="improvement">Improvement</option>
                    <option value="reusable_system">Reusable system</option>
                    <option value="decision">Decision</option>
                    <option value="risk">Risk</option>
                    <option value="unresolved_idea">Unresolved idea</option>
                    <option value="roadmap_candidate">
                      Possible roadmap candidate
                    </option>
                    <option value="missing_capability">
                      Missing capability
                    </option>
                    <option value="technical_debt">Technical debt</option>
                    <option value="cross_project_reuse">
                      Cross-project reuse
                    </option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>

              <TextAreaField
                name="description"
                label="Normalized candidate description"
                placeholder="Describe the requested result, constraints, affected area, and why it matters without inventing missing details."
                required
                rows={6}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-black/70">
                    Extraction kind *
                  </span>
                  <select
                    name="extraction_kind"
                    required
                    defaultValue="explicit_request"
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
                  >
                    <option value="explicit_request">
                      Explicit request
                    </option>
                    <option value="inferred_suggestion">
                      Inferred suggestion
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-black/70">
                    Extraction confidence *
                  </span>
                  <input
                    type="number"
                    name="extraction_confidence"
                    required
                    min="0"
                    max="1"
                    step="0.01"
                    defaultValue="1"
                    className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none transition focus:border-black"
                  />
                  <span className="mt-1 block text-xs text-black/40">
                    Use a value from 0 to 1.
                  </span>
                </label>
              </div>

              <TextAreaField
                name="missing_information"
                label="Missing information"
                placeholder="List any unresolved ownership, scope, evidence, dependency, or acceptance detail."
                rows={5}
                lineList
              />

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                The operator confirms that this source was supplied by the user
                or explicitly authorized. Saving records only a pending-review
                candidate and append-only evidence.
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-black/80"
              >
                <ClipboardList className="h-4 w-4" />
                Ingest candidate for review
              </button>
            </form>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Review queue and history</h2>
              <p className="mt-1 text-sm text-black/55">
                {selectedProject
                  ? `Showing ${selectedProject.name}.`
                  : "Showing recent intake items across all projects."}
              </p>
            </div>
            <p className="text-sm font-semibold text-black/45">
              {displayedItems.length} item
              {displayedItems.length === 1 ? "" : "s"}
            </p>
          </div>

          {displayedItems.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-black/15 bg-white/50 p-10 text-center">
              <Inbox className="mx-auto h-8 w-8 text-black/30" />
              <p className="mt-3 font-semibold">No intake items found.</p>
              <p className="mt-1 text-sm text-black/50">
                Capture the first item using the canonical form above.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {displayedItems.map((item) => {
                const itemProject = projectMap.get(item.project_key);
                const itemModule = moduleMap.get(
                  `${item.project_key}:${item.module_key}`
                );
                const itemStatus = statusMap.get(item.status_key);
                const itemHistory = historyMap.get(item.id) || [];
                const itemPackage = packageMap.get(item.id);

                return (
                  <article
                    key={item.id}
                    className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(
                              itemStatus
                            )}`}
                          >
                            {itemStatus?.name || item.status_key}
                          </span>
                          <span className="rounded-full bg-black/5 px-3 py-1 font-mono text-xs text-black/50">
                            {item.intake_key}
                          </span>
                        </div>
                        <h3 className="mt-3 text-xl font-bold">{item.title}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">
                          {item.description}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-xs text-black/55">
                        <p>{formatDate(item.created_at)}</p>
                        <p className="mt-1 font-mono">{item.project_key}</p>
                        <p className="font-mono">{item.module_key}</p>
                      </div>
                    </div>

                    <dl className="mt-5 grid gap-3 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-black/35">
                          Project
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {itemProject?.name || item.project_key}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-black/35">
                          Module
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {itemModule?.name || item.module_key}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-black/35">
                          Source
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {item.source_type}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-black/35">
                          Submitted by
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {item.submitted_by || "Not recorded"}
                        </dd>
                      </div>
                    </dl>

                    {item.source_reference ? (
                      <p className="mt-3 break-all text-xs text-black/45">
                        Source reference: {item.source_reference}
                      </p>
                    ) : null}

                    {itemStatus?.is_initial ? (
                      <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
                        <h4 className="font-bold text-amber-950">
                          Record one review decision
                        </h4>
                        <p className="mt-1 text-sm text-amber-900/70">
                          Once recorded, the database blocks a second review.
                        </p>

                        <form
                          action={reviewAthenaIntakeItem}
                          className="mt-4 space-y-4"
                        >
                          <input
                            type="hidden"
                            name="intake_id"
                            value={item.id}
                          />
                          <input
                            type="hidden"
                            name="project_key"
                            value={item.project_key}
                          />

                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-amber-950/80">
                              Decision *
                            </span>
                            <select
                              name="target_status_key"
                              required
                              defaultValue=""
                              className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500"
                            >
                              <option value="" disabled>
                                Select an active decision
                              </option>
                              {decisionStatuses.map((status) => (
                                <option
                                  key={status.status_key}
                                  value={status.status_key}
                                >
                                  {status.name}
                                  {status.review_outcome
                                    ? ` · ${status.review_outcome}`
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <TextField
                              name="reviewed_by"
                              label="Reviewed by"
                              placeholder="Operator name"
                              required
                            />
                            <TextAreaField
                              name="decision_notes"
                              label="Decision notes"
                              placeholder="Explain why the item is approved or denied."
                              required
                              rows={4}
                            />
                          </div>

                          <button
                            type="submit"
                            className="rounded-2xl bg-amber-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-900"
                          >
                            Record final decision
                          </button>
                        </form>
                      </section>
                    ) : null}

                    {itemStatus?.allows_preparation && !itemPackage ? (
                      <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5">
                        <div className="flex items-center gap-2">
                          <FileCheck2 className="h-5 w-5 text-emerald-900" />
                          <h4 className="font-bold text-emerald-950">
                            Create preparation package
                          </h4>
                        </div>
                        <p className="mt-1 text-sm text-emerald-900/70">
                          This prepares approved work only. It does not create a
                          build card, next step, QA run, or completion event.
                        </p>

                        <form
                          action={createAthenaIntakePreparationPackage}
                          className="mt-4 space-y-4"
                        >
                          <input
                            type="hidden"
                            name="intake_id"
                            value={item.id}
                          />
                          <input
                            type="hidden"
                            name="project_key"
                            value={item.project_key}
                          />

                          <TextField
                            name="package_title"
                            label="Preparation package title"
                            placeholder="Clear title for the prepared work"
                            required
                          />

                          <TextAreaField
                            name="objective"
                            label="Objective"
                            placeholder="Define what the future build should achieve."
                            required
                            rows={5}
                          />

                          <div className="grid gap-4 lg:grid-cols-2">
                            <TextField
                              name="proposed_build_id"
                              label="Proposed build ID"
                              placeholder="Optional; provide together with build title"
                            />
                            <TextField
                              name="proposed_build_title"
                              label="Proposed build title"
                              placeholder="Optional; provide together with build ID"
                            />
                          </div>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <TextAreaField
                              name="acceptance_criteria"
                              label="Acceptance criteria"
                              placeholder="Measurable completion condition"
                              lineList
                            />
                            <TextAreaField
                              name="dependencies"
                              label="Dependencies"
                              placeholder="Required system, decision, data, or prerequisite"
                              lineList
                            />
                            <TextAreaField
                              name="risks"
                              label="Risks"
                              placeholder="Known implementation or operational risk"
                              lineList
                            />
                            <TextAreaField
                              name="security_notes"
                              label="Security notes"
                              placeholder="Access, data, RLS, secrets, or project-boundary concern"
                              lineList
                            />
                          </div>

                          <TextAreaField
                            name="missing_information"
                            label="Missing information"
                            placeholder="Anything that must be resolved before a build starts"
                            lineList
                          />

                          <button
                            type="submit"
                            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-900"
                          >
                            <PackageCheck className="h-4 w-4" />
                            Save preparation package
                          </button>
                        </form>
                      </section>
                    ) : null}

                    {itemPackage ? (
                      <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5">
                        <div className="flex items-center gap-2">
                          <PackageCheck className="h-5 w-5 text-emerald-900" />
                          <h4 className="font-bold text-emerald-950">
                            {itemPackage.package_title}
                          </h4>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950/75">
                          {itemPackage.objective}
                        </p>
                        <p className="mt-2 font-mono text-xs text-emerald-900/55">
                          {itemPackage.package_key}
                        </p>

                        {itemPackage.proposed_build_id &&
                        itemPackage.proposed_build_title ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white/70 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-900/50">
                              Proposed future build
                            </p>
                            <p className="mt-1 font-semibold text-emerald-950">
                              {itemPackage.proposed_build_id} ·{" "}
                              {itemPackage.proposed_build_title}
                            </p>
                            <p className="mt-1 text-xs text-emerald-900/60">
                              Proposal only; no build card was created.
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <ListBlock
                            title="Acceptance criteria"
                            values={itemPackage.acceptance_criteria}
                          />
                          <ListBlock
                            title="Dependencies"
                            values={itemPackage.dependencies}
                          />
                          <ListBlock
                            title="Risks"
                            values={itemPackage.risks}
                          />
                          <ListBlock
                            title="Security notes"
                            values={itemPackage.security_notes}
                          />
                          <ListBlock
                            title="Missing information"
                            values={itemPackage.missing_information}
                          />
                        </div>
                      </section>
                    ) : null}

                    {itemHistory.length > 0 ? (
                      <details className="mt-5 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
                        <summary className="cursor-pointer text-sm font-bold">
                          Review history ({itemHistory.length})
                        </summary>
                        <div className="mt-4 space-y-3">
                          {itemHistory.map((historyItem) => (
                            <div
                              key={historyItem.id}
                              className="rounded-2xl border border-black/10 bg-white p-4"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-black/55">
                                <span>
                                  {historyItem.from_status_key} →{" "}
                                  {historyItem.to_status_key}
                                </span>
                                <span>•</span>
                                <span>{historyItem.review_outcome}</span>
                                <span>•</span>
                                <span>{historyItem.reviewed_by}</span>
                                <span>•</span>
                                <span>
                                  {formatDate(historyItem.created_at)}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-black/70">
                                {historyItem.decision_notes}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
