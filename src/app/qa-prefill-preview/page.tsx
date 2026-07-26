import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  ShieldAlert,
  SlidersHorizontal
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type QaPrefillPreviewPageProps = {
  searchParams: Promise<{
    feature_type?: string;
  }>;
};

type QaTemplate = {
  feature_type: string;
  template_name: string;
  description: string;
  status: string;
  check_defaults: Record<string, unknown> | null;
};

type BaseCheck = {
  check_key: string;
  label: string;
  base_status: string;
  base_actual_result: string;
  base_notes: string;
};

const baseChecks: BaseCheck[] = [
  {
    check_key: "route_or_function_exists",
    label: "Route or function exists",
    base_status: "pass",
    base_actual_result: "Route/function exists and was opened successfully.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "ui_shows_expected_new_fields",
    label: "UI shows expected new fields",
    base_status: "pass",
    base_actual_result: "UI shows the expected feature behavior.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "database_read_verified",
    label: "Database read verified",
    base_status: "pass",
    base_actual_result: "Database read behavior was verified where applicable.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "database_write_verified",
    label: "Database write verified",
    base_status: "pass",
    base_actual_result: "Database write behavior was verified where applicable.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "saved_row_verified",
    label: "Saved row verified",
    base_status: "pass",
    base_actual_result: "Saved row/result was verified where applicable.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "calculation_verified",
    label: "Calculation verified",
    base_status: "not_applicable",
    base_actual_result: "No calculation is required for this feature unless manually changed.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "no_negative_values",
    label: "No negative values",
    base_status: "not_applicable",
    base_actual_result: "No numeric planning calculation is required for this feature unless manually changed.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "no_hardcoded_planning_values",
    label: "No hardcoded planning values",
    base_status: "pass",
    base_actual_result: "No unsafe hardcoded planning value was introduced.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "rls_policy_reviewed",
    label: "RLS / security policy reviewed",
    base_status: "warning",
    base_actual_result: "Security/RLS must be reviewed for production readiness.",
    base_notes: "Base Feature Completion prefill keeps this as warning unless manually verified."
  },
  {
    check_key: "core_pages_regression_checked",
    label: "Core pages regression checked",
    base_status: "pass",
    base_actual_result: "Core Athena OS pages were checked after the change.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "terminal_build_clean",
    label: "Terminal build/dev server clean",
    base_status: "pass",
    base_actual_result: "Dev server/build check was completed.",
    base_notes: "Base Feature Completion prefill."
  },
  {
    check_key: "athena_cto_memory_recorded",
    label: "Athena CTO memory recorded",
    base_status: "pending",
    base_actual_result: "Pending until Record CTO Update Now runs.",
    base_notes: "This check is closed automatically by the CTO recording workflow."
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function statusBadge(status: string) {
  if (status === "pass") return "border-green-200 bg-green-50 text-green-700";
  if (status === "warning") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  if (status === "fail") return "border-red-200 bg-red-50 text-red-700";
  if (status === "pending") return "border-black/10 bg-black/5 text-black/60";
  if (status === "not_applicable") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-black/10 bg-white text-black/60";
}

export default async function QaPrefillPreviewPage({
  searchParams
}: QaPrefillPreviewPageProps) {
  const query = await searchParams;
  const selectedFeatureType = query.feature_type?.trim() || "standard_app_feature";

  const supabase = createAthenaCoreClient();

  const { data: templates, error } = await supabase
    .from("athena_qa_prefill_templates")
    .select("feature_type, template_name, description, status, check_defaults")
    .order("feature_type", { ascending: true })
    .returns<QaTemplate[]>();

  const templateList = templates || [];
  const selectedTemplate =
    templateList.find((template) => template.feature_type === selectedFeatureType) ||
    templateList.find((template) => template.feature_type === "standard_app_feature") ||
    null;

  const overrides = selectedTemplate?.check_defaults || {};

  const previewChecks = baseChecks.map((check) => {
    const overrideCandidate = overrides[check.check_key];
    const override = isRecord(overrideCandidate) ? overrideCandidate : null;

    return {
      ...check,
      final_status: readString(override?.status) || check.base_status,
      final_actual_result:
        readString(override?.actual_result) || check.base_actual_result,
      final_notes: readString(override?.notes) || check.base_notes,
      source: override ? "template override" : "base prefill"
    };
  });

  const passCount = previewChecks.filter((check) => check.final_status === "pass").length;
  const naCount = previewChecks.filter((check) => check.final_status === "not_applicable").length;
  const warningCount = previewChecks.filter((check) => check.final_status === "warning").length;
  const failCount = previewChecks.filter((check) => check.final_status === "fail").length;
  const pendingCount = previewChecks.filter((check) => check.final_status === "pending").length;

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
            href="/qa-prefill-templates"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <SlidersHorizontal className="h-4 w-4" />
            QA Templates
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Eye className="h-4 w-4" />
            QA Prefill Preview
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Preview before applying
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Check what a feature type will do to each QA check before clicking Prefill Latest QA Checks in the Feature Completion workflow.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            QA prefill template read error: {error.message}
          </div>
        ) : null}

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <form action="/qa-prefill-preview" method="get" className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Feature type
              </label>
              <select
                name="feature_type"
                defaultValue={selectedTemplate?.feature_type || selectedFeatureType}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                {templateList.map((template) => (
                  <option key={template.feature_type} value={template.feature_type}>
                    {template.feature_type} — {template.template_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
              >
                Preview Template
              </button>
            </div>
          </form>
        </section>

        {selectedTemplate ? (
          <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-black/45">Selected template</p>
                <h2 className="mt-1 text-3xl font-semibold">
                  {selectedTemplate.template_name}
                </h2>
                <p className="mt-2 font-mono text-sm text-black/40">
                  {selectedTemplate.feature_type}
                </p>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-black/60">
                  {selectedTemplate.description}
                </p>
              </div>

              <span className="rounded-full border border-black/10 bg-black/5 px-4 py-2 text-sm font-medium text-black/60">
                {selectedTemplate.status}
              </span>
            </div>
          </section>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-5">
          <div className="rounded-[2rem] border border-green-200 bg-green-50 p-6">
            <CheckCircle2 className="mb-4 h-6 w-6 text-green-700" />
            <p className="text-sm text-green-700/70">Pass</p>
            <p className="mt-2 text-3xl font-semibold text-green-800">{passCount}</p>
          </div>

          <div className="rounded-[2rem] border border-blue-200 bg-blue-50 p-6">
            <p className="text-sm text-blue-700/70">N/A</p>
            <p className="mt-2 text-3xl font-semibold text-blue-800">{naCount}</p>
          </div>

          <div className="rounded-[2rem] border border-yellow-200 bg-yellow-50 p-6">
            <ShieldAlert className="mb-4 h-6 w-6 text-yellow-800" />
            <p className="text-sm text-yellow-800/70">Warning</p>
            <p className="mt-2 text-3xl font-semibold text-yellow-900">{warningCount}</p>
          </div>

          <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6">
            <p className="text-sm text-red-700/70">Fail</p>
            <p className="mt-2 text-3xl font-semibold text-red-800">{failCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6">
            <p className="text-sm text-black/45">Pending</p>
            <p className="mt-2 text-3xl font-semibold">{pendingCount}</p>
          </div>
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Effective QA state before CTO recording</p>
            <h2 className="text-3xl font-semibold">Previewed checks</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">
              The Athena CTO memory check stays pending in this preview because it only closes after Record CTO Update Now runs.
            </p>
          </div>

          <div className="grid gap-4">
            {previewChecks.map((check) => (
              <article
                key={check.check_key}
                className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(check.final_status)}`}>
                    {check.final_status}
                  </span>

                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                    {check.source}
                  </span>

                  <span className="rounded-full bg-white px-3 py-1 font-mono text-xs text-black/45">
                    {check.check_key}
                  </span>
                </div>

                <h3 className="text-xl font-semibold">{check.label}</h3>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-black/35">
                      Actual result
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/65">
                      {check.final_actual_result}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-black/35">
                      Notes / evidence
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/65">
                      {check.final_notes}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena QA Prefill Preview v1
        </footer>
      </section>
    </main>
  );
}