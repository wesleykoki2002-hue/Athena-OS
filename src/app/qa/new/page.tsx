import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  ClipboardCheck,
  PlusCircle,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { createQaRun } from "@/app/qa/actions";

type NewQaPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  priority: string;
  status: string;
};

type QaTemplate = {
  template_key: string;
  name: string;
  scope: string;
  status: string;
};

export default async function NewQaPage({ searchParams }: NewQaPageProps) {
  const query = await searchParams;
  const supabase = createAthenaCoreClient();

  const { data: projects } = await supabase
    .from("athena_projects")
    .select("project_key, name, priority, status")
    .order("priority", { ascending: true })
    .order("name", { ascending: true })
    .returns<Project[]>();

  const { data: templates } = await supabase
    .from("athena_qa_templates")
    .select("template_key, name, scope, status")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .returns<QaTemplate[]>();

  const projectOptions = projects || [];
  const templateOptions = templates || [];

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/qa"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to QA Center
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Brain className="h-4 w-4" />
            Athena OS
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <ClipboardCheck className="h-4 w-4" />
            New QA Run
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Start QA Gate
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Create a QA run after building a feature. Athena will copy the checklist template into a new run so every item can be checked before marking the feature working.
          </p>
        </header>

        {query.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        <form action={createQaRun} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Project
              </label>
              <select
                name="project_key"
                required
                defaultValue=""
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="">Select canonical project</option>
                {projectOptions.map((project) => (
                  <option key={project.project_key} value={project.project_key}>
                    {project.name} — {project.priority} — {project.status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Module key
              </label>
              <input
                name="module_key"
                required
                placeholder="Example: qa-gate"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                Required. The project/module pair must already exist in the canonical Athena CTO registry.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Feature name
              </label>
              <input
                name="feature_name"
                required
                placeholder="Example: QA Center page"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Route path
              </label>
              <input
                name="route_path"
                placeholder="Example: /qa"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black/70">
                Build session title
              </label>
              <input
                name="build_session_title"
                required
                placeholder="Example: 0042 Athena database registry and object map working"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                Use the Athena CTO session title this QA run belongs to. This prevents confusing 0041, 0042, 0043, etc.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black/70">
                QA template
              </label>
              <select
                name="template_key"
                required
                defaultValue="athena-feature-completion-gate-v1"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                {templateOptions.map((template) => (
                  <option key={template.template_key} value={template.template_key}>
                    {template.name} — {template.scope}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-black/70">
              Summary
            </label>
            <textarea
              name="summary"
              rows={4}
              placeholder="What feature are we testing and what should QA prove?"
              className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
            />
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <Sparkles className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Creates QA run</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Saves one QA run and copies the checklist items into check results.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <ShieldCheck className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Prevents false completion</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                A feature should not be called working until its QA run passes or accepted warnings are documented.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <ClipboardCheck className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Real checklist</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Checks are copied from athena_qa_templates, not hardcoded into this page.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <PlusCircle className="h-4 w-4" />
            Create QA Run
          </button>
        </form>
      </section>
    </main>
  );
}
