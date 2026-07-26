import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Save,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { updateReusableComponent } from "@/app/reusable/actions";

type EditReusablePageProps = {
  params: Promise<{
    componentKey: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

type ReusableComponent = {
  component_key: string;
  name: string;
  description: string | null;
  source_project_key: string | null;
  component_type: string | null;
  status: string | null;
  reusable_in_projects: string[] | null;
  estimated_hours_saved: number | null;
  notes: string | null;
};

function listToText(value: string[] | null) {
  return Array.isArray(value) ? value.join("\n") : "";
}

export default async function EditReusableComponentPage({
  params,
  searchParams
}: EditReusablePageProps) {
  const { componentKey } = await params;
  const query = await searchParams;

  const supabase = createAthenaCoreClient();

  const { data: component } = await supabase
    .from("athena_reusable_components")
    .select(
      "component_key, name, description, source_project_key, component_type, status, reusable_in_projects, estimated_hours_saved, notes"
    )
    .eq("component_key", componentKey)
    .maybeSingle<ReusableComponent>();

  const { data: projects } = await supabase
    .from("athena_projects")
    .select("project_key, name")
    .order("project_key", { ascending: true });

  const safeComponent: ReusableComponent = component || {
    component_key: componentKey,
    name: componentKey,
    description: "",
    source_project_key: "",
    component_type: "",
    status: "available",
    reusable_in_projects: [],
    estimated_hours_saved: 0,
    notes: ""
  };

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href={`/reusable/${componentKey}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to component
          </Link>

          <Link
            href="/reusable"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Brain className="h-4 w-4" />
            Reusable library
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Zap className="h-4 w-4" />
            Reusable Component Edit UI
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Edit {safeComponent.name}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Update the reusable component using real database fields. Hours saved and reusable projects will affect Athena OS reuse tracking.
          </p>
        </header>

        {!component ? (
          <div className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Component was not loaded from Supabase. The route works, but saving may fail if this component key does not exist.
          </div>
        ) : null}

        {query.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        <form action={updateReusableComponent} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <input type="hidden" name="component_key" value={safeComponent.component_key} />

          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Component key
              </label>
              <input
                value={safeComponent.component_key}
                disabled
                className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-black/50 outline-none"
              />
              <p className="mt-1 text-xs text-black/35">
                Component key is locked to avoid breaking links.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Component name
              </label>
              <input
                name="name"
                defaultValue={safeComponent.name}
                required
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Source project
              </label>
              <select
                name="source_project_key"
                defaultValue={safeComponent.source_project_key || ""}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="">No source project</option>
                {(projects || []).map((project) => (
                  <option key={project.project_key} value={project.project_key}>
                    {project.name} — {project.project_key}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Component type
              </label>
              <input
                name="component_type"
                defaultValue={safeComponent.component_type || ""}
                placeholder="database_pattern, ai_pattern, process, module_pattern"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Status
              </label>
              <select
                name="status"
                defaultValue={safeComponent.status || "available"}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="available">available</option>
                <option value="working">working</option>
                <option value="planned">planned</option>
                <option value="deprecated">deprecated</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Estimated hours saved
              </label>
              <input
                name="estimated_hours_saved"
                type="number"
                min="0"
                step="0.25"
                defaultValue={safeComponent.estimated_hours_saved ?? 0}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                This is saved to estimated_hours_saved in Supabase.
              </p>
            </div>
          </div>

          <div className="mb-8 grid gap-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Description
              </label>
              <textarea
                name="description"
                rows={4}
                defaultValue={safeComponent.description || ""}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Reusable in projects
              </label>
              <textarea
                name="reusable_in_projects"
                rows={6}
                defaultValue={listToText(safeComponent.reusable_in_projects)}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                One project key per line. Example: athena-os, beautydna, hanna-commerce-os.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Athena CTO notes
              </label>
              <textarea
                name="notes"
                rows={5}
                defaultValue={safeComponent.notes || ""}
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <Sparkles className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Updates reuse tracking</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                The reusable list and detail page will show the updated projects and hours saved.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <Brain className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Refreshes command center</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                After save, Athena regenerates the Daily Briefing.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <ShieldCheck className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Planning data only</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                This edits Athena Core reuse records, not customer data.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <Save className="h-4 w-4" />
            Save Reusable Component
          </button>
        </form>
      </section>
    </main>
  );
}