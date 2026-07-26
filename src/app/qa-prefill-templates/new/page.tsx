import Link from "next/link";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import { saveQaPrefillTemplate } from "@/app/qa-prefill-templates/actions";

type NewQaPrefillTemplatePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewQaPrefillTemplatePage({
  searchParams
}: NewQaPrefillTemplatePageProps) {
  const query = await searchParams;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/qa-prefill-templates"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to QA Templates
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <SlidersHorizontal className="h-4 w-4" />
            New QA Prefill Template
          </div>

          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Create Template
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Create a new feature-type template for the Feature Completion Command Center. The JSON must be a check-key object.
          </p>
        </header>

        {query.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        <form action={saveQaPrefillTemplate} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Feature type
              </label>
              <input
                name="feature_type"
                required
                placeholder="example_feature_type"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-black/40">
                Lowercase letters, numbers, and underscores are safest.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black/70">
                Status
              </label>
              <select
                name="status"
                defaultValue="draft"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              >
                <option value="active">active</option>
                <option value="draft">draft</option>
                <option value="deprecated">deprecated</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black/70">
                Template name
              </label>
              <input
                name="template_name"
                required
                placeholder="Example Feature Type"
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black/70">
                Description
              </label>
              <textarea
                name="description"
                required
                rows={4}
                placeholder="Explain when Athena should use this template."
                className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black/70">
                Check defaults JSON
              </label>
              <textarea
                name="check_defaults_text"
                rows={16}
                defaultValue={`{
  "database_write_verified": {
    "status": "not_applicable",
    "actual_result": "Not applicable. Explain why.",
    "notes": "Applied custom QA prefill template."
  }
}`}
                className="w-full rounded-2xl border border-black/10 bg-[#171717] px-4 py-3 font-mono text-sm leading-6 text-white outline-none focus:border-black"
              />
            </div>
          </div>

          <button
            type="submit"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <Save className="h-4 w-4" />
            Save Template
          </button>
        </form>
      </section>
    </main>
  );
}