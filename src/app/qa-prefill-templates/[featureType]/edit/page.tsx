import Link from "next/link";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import {
  archiveQaPrefillTemplate,
  deleteQaPrefillTemplate,
  saveQaPrefillTemplate
} from "@/app/qa-prefill-templates/actions";

type EditQaPrefillTemplatePageProps = {
  params: Promise<{
    featureType: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

type QaPrefillTemplate = {
  feature_type: string;
  template_name: string;
  description: string;
  status: string;
  check_defaults: Record<string, unknown>;
};

export default async function EditQaPrefillTemplatePage({
  params,
  searchParams
}: EditQaPrefillTemplatePageProps) {
  const { featureType } = await params;
  const query = await searchParams;

  const decodedFeatureType = decodeURIComponent(featureType);

  const supabase = createAthenaCoreClient();

  const { data: template, error } = await supabase
    .from("athena_qa_prefill_templates")
    .select("*")
    .eq("feature_type", decodedFeatureType)
    .maybeSingle<QaPrefillTemplate>();

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
            Edit QA Prefill Template
          </div>

          <h1 className="break-words text-4xl font-semibold tracking-tight md:text-6xl">
            {decodedFeatureType}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Edit template metadata and check-default JSON. The feature type key is locked to prevent breaking existing completion workflows.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Template read error: {error.message}
          </div>
        ) : null}

        {query.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        ) : null}

        {!template ? (
          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 text-center shadow-sm">
            <h2 className="text-3xl font-semibold">Template not found</h2>
            <p className="mt-3 text-black/55">
              No QA prefill template exists for this feature type.
            </p>
          </section>
        ) : (
          <form action={saveQaPrefillTemplate} className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
            <input type="hidden" name="original_feature_type" value={template.feature_type} />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-black/70">
                  Feature type
                </label>
                <input
                  name="feature_type"
                  readOnly
                  defaultValue={template.feature_type}
                  className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 font-mono text-sm text-black/60 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-black/70">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue={template.status}
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
                  defaultValue={template.template_name}
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
                  defaultValue={template.description}
                  className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-black/70">
                  Check defaults JSON
                </label>
                <textarea
                  name="check_defaults_text"
                  rows={18}
                  defaultValue={JSON.stringify(template.check_defaults || {}, null, 2)}
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
        )}

        {template ? (
          <section className="mt-6 rounded-[2.5rem] border border-red-200 bg-red-50 p-8 shadow-sm">
            <h2 className="text-3xl font-semibold text-red-900">
              Danger zone
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-red-800">
              Archive a template when you want to stop using it but keep the record. Delete only temporary or test templates. Deleting an active template can break feature completion workflows that depend on that feature type.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <form action={archiveQaPrefillTemplate} className="rounded-3xl border border-red-200 bg-white p-5">
                <input type="hidden" name="feature_type" value={template.feature_type} />

                <h3 className="text-xl font-semibold">Archive template</h3>
                <p className="mt-2 text-sm leading-6 text-black/55">
                  Sets status to deprecated. The row remains in Supabase.
                </p>

                <button
                  type="submit"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100"
                >
                  Archive Template
                </button>
              </form>

              <form action={deleteQaPrefillTemplate} className="rounded-3xl border border-red-200 bg-white p-5">
                <input type="hidden" name="feature_type" value={template.feature_type} />

                <h3 className="text-xl font-semibold">Delete template</h3>
                <p className="mt-2 text-sm leading-6 text-black/55">
                  To delete, type the exact feature type:
                </p>

                <p className="mt-2 rounded-2xl bg-black/5 px-4 py-3 font-mono text-xs text-black/60">
                  {template.feature_type}
                </p>

                <input
                  name="delete_confirmation"
                  placeholder={template.feature_type}
                  className="mt-4 w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm outline-none focus:border-red-500"
                />

                <button
                  type="submit"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  Delete Template
                </button>
              </form>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}