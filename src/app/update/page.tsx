import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Clock,
  FileText,
  Rocket,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { createAthenaCtoUpdate } from "@/app/update/actions";

type UpdatePageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type Project = {
  project_key: string;
  name: string;
  priority: string;
  status: string;
  estimated_remaining_hours: number | null;
};

type ProjectModule = {
  project_key: string;
  module_key: string;
  name: string;
  status: string;
  priority: string;
  estimated_remaining_hours: number | null;
};

function TextAreaField({
  name,
  label,
  placeholder
}: {
  name: string;
  label: string;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-black/70">{label}</label>
      <textarea
        name={name}
        rows={4}
        className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm outline-none focus:border-black"
        placeholder={placeholder}
      />
      <p className="mt-1 text-xs text-black/35">One item per line.</p>
    </div>
  );
}

export default async function UpdatePage({ searchParams }: UpdatePageProps) {
  const query = await searchParams;
  const supabase = createAthenaCoreClient();

  const { data: projects } = await supabase
    .from("athena_projects")
    .select("project_key, name, priority, status, estimated_remaining_hours")
    .order("priority", { ascending: true })
    .order("name", { ascending: true })
    .returns<Project[]>();

  const { data: modules } = await supabase
    .from("athena_project_modules")
    .select("project_key, module_key, name, status, priority, estimated_remaining_hours")
    .neq("status", "archived")
    .order("project_key", { ascending: true })
    .order("priority", { ascending: true })
    .order("estimated_remaining_hours", { ascending: false })
    .returns<ProjectModule[]>();

  const projectOptions =
    projects && projects.length > 0
      ? projects
      : [
          { project_key: "athena-os", name: "Athena OS", priority: "P0", status: "building", estimated_remaining_hours: null },
          { project_key: "athena-cto", name: "Athena CTO", priority: "P0", status: "active", estimated_remaining_hours: null },
          { project_key: "athena-business-os", name: "Athena Business OS", priority: "P0", status: "prototype", estimated_remaining_hours: null },
          { project_key: "beautydna", name: "BeautyDNA / FaceDNA", priority: "P0", status: "near_launch", estimated_remaining_hours: null },
          { project_key: "hanna-japan-store", name: "Hanna Japan Store", priority: "P0", status: "active", estimated_remaining_hours: null }
        ];

  const moduleList = modules || [];
  const athenaOs = projectOptions.find((project) => project.project_key === "athena-os");
  const defaultProjectKey = athenaOs?.project_key || projectOptions[0]?.project_key || "athena-os";

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-5xl">
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
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Brain className="h-4 w-4" />
            Athena CTO Update UI
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Record Build Progress
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Record what you built. If you select a module and enter hours spent, Athena subtracts that time from the module, recalculates the project, refreshes the dashboard, and records the new remaining hours.
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

        <form action={createAthenaCtoUpdate} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Project
              </label>
              <select
                name="product_key"
                required
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                defaultValue={defaultProjectKey}
              >
                {projectOptions.map((project) => (
                  <option key={project.project_key} value={project.project_key}>
                    {project.name} — {project.priority} — {project.status} — {project.estimated_remaining_hours ?? 0}h left
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-black/35">
                Project remaining hours come from athena_projects.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Session title
              </label>
              <input
                name="session_title"
                required
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                placeholder="Example: 0041 Build Log time deduction working"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Module worked on
              </label>
              <select
                name="module_key"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                defaultValue=""
              >
                <option value="">No module selected — record log only</option>
                {moduleList.map((moduleItem) => (
                  <option
                    key={`${moduleItem.project_key}-${moduleItem.module_key}`}
                    value={moduleItem.module_key}
                  >
                    {moduleItem.project_key} / {moduleItem.name} — {moduleItem.priority} — {moduleItem.estimated_remaining_hours ?? 0}h left
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-black/35">
                Choose a module from the same project if hours spent should reduce remaining hours.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Hours spent
              </label>
              <input
                name="hours_spent"
                type="number"
                step="0.25"
                defaultValue="0"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                0 keeps hours unchanged. More than 0 subtracts from the selected module.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black/70">
                Manual remaining-hours override
              </label>
              <input
                name="estimated_remaining_hours"
                type="number"
                step="0.25"
                placeholder="Leave blank. Athena calculates from module/project data."
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/35">
                Use only if you need to override the calculated project value. Normally leave this blank.
              </p>
            </div>
          </div>

          <div className="mb-8 rounded-3xl border border-black/10 bg-[#f5f1ea] p-5">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <p className="font-semibold">Time deduction rule</p>
            </div>
            <p className="text-sm leading-6 text-black/60">
              If hours spent is 0, Athena records the build log only. If hours spent is greater than 0 and a module is selected, Athena subtracts that number from the module remaining hours. The database trigger then recalculates the parent project total.
            </p>
          </div>

          <div className="grid gap-5">
            <TextAreaField
              name="completed"
              label="Completed"
              placeholder={"Created update page\nConnected update form to Athena CTO function\nConfirmed update works"}
            />

            <TextAreaField
              name="files_created"
              label="Files created"
              placeholder={"C:\\supabase\\athena-os\\src\\app\\update\\page.tsx"}
            />

            <TextAreaField
              name="files_modified"
              label="Files modified"
              placeholder={"C:\\supabase\\athena-os\\src\\app\\page.tsx"}
            />

            <TextAreaField
              name="database_changes"
              label="Database changes"
              placeholder={"Created new view\nUpdated project registry"}
            />

            <TextAreaField
              name="decisions"
              label="Decisions"
              placeholder={"Athena OS should record build progress from the UI"}
            />

            <TextAreaField
              name="security_notes"
              label="Security notes"
              placeholder={"ATHENA_CTO_ADMIN_KEY is server-side only\nNo customer production data is exposed"}
            />

            <TextAreaField
              name="missing"
              label="Missing"
              placeholder={"Homepage shortcut\nProject update UI"}
            />

            <TextAreaField
              name="next_steps"
              label="Next steps"
              placeholder={"Add Update shortcut to homepage"}
            />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <FileText className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Build memory</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Every update becomes project memory for Athena CTO.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <ShieldCheck className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Safe calculation</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Remaining hours come from modules and project data, not hardcoded placeholders.
              </p>
            </div>

            <div className="rounded-3xl bg-[#f5f1ea] p-5">
              <Rocket className="mb-3 h-5 w-5" />
              <p className="text-sm font-medium">Next-step fuel</p>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Better logs improve the next-step engine.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <Sparkles className="h-4 w-4" />
            Record Athena CTO Update
          </button>
        </form>
      </section>
    </main>
  );
}