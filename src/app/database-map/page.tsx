import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Database,
  FileCode2,
  ShieldAlert,
  TestTube2
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type DatabaseObject = {
  object_type: string;
  object_schema: string;
  object_name: string;
  parent_object_name: string | null;
  object_detail: string | null;
  registered_change_name: string;
  project_key: string | null;
  module_key: string | null;
  registry_status: string | null;
  description: string | null;
  security_notes: string | null;
  test_notes: string | null;
  is_registered: boolean;
};

function objectBadge(objectType: string) {
  if (objectType === "table") return "bg-black text-white";
  if (objectType === "view") return "bg-blue-50 text-blue-700";
  if (objectType === "function") return "bg-purple-50 text-purple-700";
  if (objectType === "policy") return "bg-yellow-50 text-yellow-800";
  if (objectType === "trigger") return "bg-orange-50 text-orange-700";
  return "bg-black/5 text-black/60";
}

function registryBadge(isRegistered: boolean) {
  if (isRegistered) return "bg-green-50 text-green-700 border-green-200";
  return "bg-red-50 text-red-700 border-red-200";
}

export default async function DatabaseMapPage() {
  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase
    .from("athena_database_object_map")
    .select("*")
    .order("is_registered", { ascending: true })
    .order("object_type", { ascending: true })
    .order("object_name", { ascending: true })
    .returns<DatabaseObject[]>();

  const objects = data || [];

  const totalObjects = objects.length;
  const registeredObjects = objects.filter((object) => object.is_registered).length;
  const unregisteredObjects = objects.filter((object) => !object.is_registered).length;
  const tableCount = objects.filter((object) => object.object_type === "table").length;
  const viewCount = objects.filter((object) => object.object_type === "view").length;
  const functionCount = objects.filter((object) => object.object_type === "function").length;
  const policyCount = objects.filter((object) => object.object_type === "policy").length;
  const triggerCount = objects.filter((object) => object.object_type === "trigger").length;

  const unregisteredList = objects.filter((object) => !object.is_registered);
  const registeredList = objects.filter((object) => object.is_registered);

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
            href="/database-changes"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Database className="h-4 w-4" />
            Database Changes
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
            <Brain className="h-4 w-4" />
            Athena Live Database Map
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            Database Object Map
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Live map of what actually exists in Supabase. This shows tables, views, functions, policies, and triggers, then checks whether each object has a named registry entry in Athena.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Database map read error: {error.message}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-4 lg:grid-cols-8">
          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <Database className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Total</p>
            <p className="mt-2 text-3xl font-semibold">{totalObjects}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <CheckCircle2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Registered</p>
            <p className="mt-2 text-3xl font-semibold">{registeredObjects}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <AlertTriangle className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Unregistered</p>
            <p className="mt-2 text-3xl font-semibold">{unregisteredObjects}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <Database className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Tables</p>
            <p className="mt-2 text-3xl font-semibold">{tableCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <FileCode2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Views</p>
            <p className="mt-2 text-3xl font-semibold">{viewCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <FileCode2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Functions</p>
            <p className="mt-2 text-3xl font-semibold">{functionCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <ShieldAlert className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Policies</p>
            <p className="mt-2 text-3xl font-semibold">{policyCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
            <Brain className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Triggers</p>
            <p className="mt-2 text-3xl font-semibold">{triggerCount}</p>
          </div>
        </div>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Developer handoff risk</p>
            <h2 className="text-3xl font-semibold">Unregistered objects</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">
              These objects exist in Supabase, but Athena does not yet have a named explanation for them. We should register important ones so a developer can understand what they are, why they exist, and what is safe to change.
            </p>
          </div>

          {unregisteredList.length === 0 ? (
            <div className="rounded-3xl border border-green-200 bg-green-50 p-6 text-green-700">
              <p className="font-medium">All database objects are registered.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {unregisteredList.map((object) => (
                <article
                  key={`${object.object_type}-${object.object_schema}-${object.parent_object_name || "root"}-${object.object_name}`}
                  className="rounded-[2rem] border border-red-100 bg-red-50/50 p-5"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${objectBadge(object.object_type)}`}>
                      {object.object_type}
                    </span>

                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${registryBadge(object.is_registered)}`}>
                      unregistered
                    </span>

                    {object.parent_object_name ? (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-black/55">
                        parent: {object.parent_object_name}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="break-words font-mono text-lg font-semibold">
                    {object.object_schema}.{object.object_name}
                  </h3>

                  {object.object_detail ? (
                    <p className="mt-2 break-words text-sm text-black/55">
                      {object.object_detail}
                    </p>
                  ) : null}

                  <p className="mt-3 text-sm text-red-700">
                    Needs registry entry in public.athena_database_changes.
                  </p>

                  <Link
                    href={`/database-changes/new?object_type=${encodeURIComponent(object.object_type)}&object_name=${encodeURIComponent(object.parent_object_name ? `${object.object_schema}.${object.parent_object_name}.${object.object_name}` : `${object.object_schema}.${object.object_name}`)}&change_name=${encodeURIComponent(`Register ${object.object_type} ${object.parent_object_name ? `${object.object_schema}.${object.parent_object_name}.${object.object_name}` : `${object.object_schema}.${object.object_name}`}`)}&change_key=${encodeURIComponent(`register-${object.object_type}-${object.parent_object_name ? `${object.object_schema}-${object.parent_object_name}-${object.object_name}` : `${object.object_schema}-${object.object_name}`}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))}&change_type=${encodeURIComponent(object.object_type === "view" ? "create_view" : object.object_type === "function" ? "create_function" : object.object_type === "policy" ? "create_policy" : object.object_type === "trigger" ? "create_trigger" : object.object_type === "table" ? "create_table" : "schema_change")}`}
                    className="mt-4 inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/85"
                  >
                    Register this object
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Registered map</p>
            <h2 className="text-3xl font-semibold">Named objects</h2>
          </div>

          {registeredList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No registered objects yet</p>
            </div>
          ) : (
            <div className="grid gap-5">
              {registeredList.map((object) => (
                <article
                  key={`${object.object_type}-${object.object_schema}-${object.parent_object_name || "root"}-${object.object_name}`}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${objectBadge(object.object_type)}`}>
                      {object.object_type}
                    </span>

                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${registryBadge(object.is_registered)}`}>
                      registered
                    </span>

                    {object.registry_status ? (
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {object.registry_status}
                      </span>
                    ) : null}

                    {object.project_key ? (
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {object.project_key}
                      </span>
                    ) : null}

                    {object.module_key ? (
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {object.module_key}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-2xl font-semibold">{object.registered_change_name}</h3>

                  <p className="mt-2 break-words font-mono text-sm text-black/55">
                    {object.object_schema}.{object.object_name}
                  </p>

                  {object.parent_object_name ? (
                    <p className="mt-1 text-xs text-black/35">
                      Parent object: {object.parent_object_name}
                    </p>
                  ) : null}

                  {object.object_detail ? (
                    <p className="mt-3 break-words text-sm leading-6 text-black/55">
                      {object.object_detail}
                    </p>
                  ) : null}

                  {object.description ? (
                    <p className="mt-4 max-w-4xl leading-7 text-black/65">
                      {object.description}
                    </p>
                  ) : null}

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl bg-white p-5">
                      <p className="mb-2 text-sm font-medium">Security notes</p>
                      <p className="text-sm leading-6 text-black/55">
                        {object.security_notes || "No security notes recorded."}
                      </p>
                    </div>

                    <div className="rounded-3xl bg-white p-5">
                      <p className="mb-2 text-sm font-medium">Test notes</p>
                      <p className="text-sm leading-6 text-black/55">
                        {object.test_notes || "No test notes recorded."}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Database Object Map v1
        </footer>
      </section>
    </main>
  );
}