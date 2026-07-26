import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ShieldAlert,
  SlidersHorizontal,
  TestTube2
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type QaPrefillTemplate = {
  id: string;
  feature_type: string;
  template_name: string;
  description: string;
  status: string;
  check_defaults: Record<
    string,
    {
      status?: string;
      actual_result?: string;
      notes?: string;
    }
  >;
  created_at: string;
  updated_at: string;
};

function statusBadge(status: string) {
  if (status === "active") return "border-green-200 bg-green-50 text-green-700";
  if (status === "draft") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "deprecated") return "border-red-200 bg-red-50 text-red-700";
  return "border-black/10 bg-black/5 text-black/60";
}

function checkStatusBadge(status?: string) {
  if (status === "pass") return "border-green-200 bg-green-50 text-green-700";
  if (status === "warning") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  if (status === "fail") return "border-red-200 bg-red-50 text-red-700";
  if (status === "pending") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "not_applicable") return "border-black/10 bg-black/5 text-black/60";
  return "border-black/10 bg-white text-black/50";
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

export default async function QaPrefillTemplatesPage() {
  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase
    .from("athena_qa_prefill_templates")
    .select("*")
    .order("feature_type", { ascending: true })
    .returns<QaPrefillTemplate[]>();

  const templates = data || [];

  const totalTemplates = templates.length;
  const activeTemplates = templates.filter((template) => template.status === "active").length;
  const templateOverrides = templates.reduce((total, template) => {
    return total + Object.keys(template.check_defaults || {}).length;
  }, 0);

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
            <TestTube2 className="h-4 w-4" />
            QA Center
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <SlidersHorizontal className="h-4 w-4" />
            Athena QA Automation
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            QA Prefill Templates
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Feature-type templates used by Feature Completion Command Center to prefill QA checks correctly for normal app features, read-only pages, homepage shortcuts, and database registry changes.
          </p>

          <Link
            href="/qa-prefill-templates/new"
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
          >
            New Template
          </Link>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            QA prefill template read error: {error.message}
          </div>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <FileText className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Total templates</p>
            <p className="mt-2 text-3xl font-semibold">{totalTemplates}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <CheckCircle2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Active templates</p>
            <p className="mt-2 text-3xl font-semibold">{activeTemplates}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ShieldAlert className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Check overrides</p>
            <p className="mt-2 text-3xl font-semibold">{templateOverrides}</p>
          </div>
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Feature type logic</p>
            <h2 className="text-3xl font-semibold">Templates</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">
              These templates do not replace human review. They only improve the default QA evidence so you do not need to manually change common checks every time.
            </p>
          </div>

          {templates.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No QA prefill templates found</p>
              <p className="mt-2 text-sm text-black/55">
                Seed public.athena_qa_prefill_templates before using this page.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {templates.map((template) => {
                const defaults = Object.entries(template.check_defaults || {});

                return (
                  <article
                    key={template.id}
                    className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(template.status)}`}>
                        {template.status}
                      </span>

                      <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                        {template.feature_type}
                      </span>

                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {defaults.length} overrides
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <h3 className="text-2xl font-semibold">{template.template_name}</h3>

                      <Link
                        href={`/qa-prefill-templates/${template.feature_type}/edit`}
                        className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/85"
                      >
                        Edit Template
                      </Link>
                    </div>

                    <p className="mt-3 max-w-4xl text-sm leading-6 text-black/60">
                      {template.description}
                    </p>

                    <div className="mt-4 grid gap-3 text-xs text-black/45 md:grid-cols-2">
                      <p>Created: {formatDate(template.created_at)}</p>
                      <p>Updated: {formatDate(template.updated_at)}</p>
                    </div>

                    <div className="mt-6">
                      <p className="mb-3 text-sm font-medium">QA check defaults</p>

                      {defaults.length === 0 ? (
                        <div className="rounded-3xl bg-white p-5 text-sm text-black/55">
                          No overrides. This template uses the standard Feature Completion defaults.
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {defaults.map(([checkKey, value]) => (
                            <div
                              key={checkKey}
                              className="rounded-3xl bg-white p-5"
                            >
                              <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-black/5 px-3 py-1 font-mono text-xs text-black/60">
                                  {checkKey}
                                </span>

                                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${checkStatusBadge(value.status)}`}>
                                  {value.status || "no status override"}
                                </span>
                              </div>

                              {value.actual_result ? (
                                <p className="text-sm leading-6 text-black/60">
                                  <span className="font-medium text-black">Actual result:</span>{" "}
                                  {value.actual_result}
                                </p>
                              ) : null}

                              {value.notes ? (
                                <p className="mt-2 text-sm leading-6 text-black/60">
                                  <span className="font-medium text-black">Notes:</span>{" "}
                                  {value.notes}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena QA Prefill Templates v1
        </footer>
      </section>
    </main>
  );
}