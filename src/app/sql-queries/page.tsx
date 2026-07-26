import Link from "next/link";
import {
  ArrowLeft,
  Code2,
  Database,
  FileSearch,
  ShieldAlert,
  TestTube2
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type SqlQuery = {
  id: string;
  query_key: string;
  query_name: string;
  project_key: string;
  module_key: string | null;
  build_session_title: string | null;
  category: string;
  query_type: string;
  status: string;
  purpose: string;
  sql_text: string;
  expected_result: string | null;
  safety_notes: string | null;
  usage_notes: string | null;
  created_at: string;
  updated_at: string;
};

function statusBadge(status: string) {
  if (status === "active") return "bg-green-50 text-green-700 border-green-200";
  if (status === "draft") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "deprecated") return "bg-red-50 text-red-700 border-red-200";
  return "bg-black/5 text-black/60 border-black/10";
}

function categoryBadge(category: string) {
  if (category === "qa") return "bg-black text-white";
  if (category === "planning") return "bg-blue-50 text-blue-700";
  if (category === "database-map") return "bg-purple-50 text-purple-700";
  if (category === "athena-cto") return "bg-yellow-50 text-yellow-800";
  return "bg-black/5 text-black/60";
}

export default async function SqlQueriesPage() {
  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase
    .from("athena_sql_queries")
    .select("*")
    .order("category", { ascending: true })
    .order("query_name", { ascending: true })
    .returns<SqlQuery[]>();

  const queries = data || [];

  const totalQueries = queries.length;
  const activeQueries = queries.filter((query) => query.status === "active").length;
  const selectQueries = queries.filter((query) => query.query_type === "select").length;
  const categories = Array.from(new Set(queries.map((query) => query.category))).length;

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
            href="/qa"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <TestTube2 className="h-4 w-4" />
            QA Center
          </Link>

          <Link
            href="/database-map"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <Database className="h-4 w-4" />
            Database Map
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Code2 className="h-4 w-4" />
            Athena SQL Registry
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            SQL Query Registry
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            Named reusable SQL diagnostics, QA checks, and developer handoff queries. These queries are stored for reference only. Athena does not execute arbitrary SQL from this page.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            SQL query registry read error: {error.message}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <FileSearch className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Total queries</p>
            <p className="mt-2 text-3xl font-semibold">{totalQueries}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Code2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Active</p>
            <p className="mt-2 text-3xl font-semibold">{activeQueries}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Database className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">SELECT-only</p>
            <p className="mt-2 text-3xl font-semibold">{selectQueries}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ShieldAlert className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Categories</p>
            <p className="mt-2 text-3xl font-semibold">{categories}</p>
          </div>
        </div>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Reusable diagnostics</p>
            <h2 className="text-3xl font-semibold">Named SQL queries</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">
              Copy these queries into Supabase SQL Editor when needed. Replace placeholders like &lt;PROJECT_KEY&gt;, &lt;FEATURE_NAME&gt;, and &lt;BUILD_SESSION_TITLE&gt; before running.
            </p>
          </div>

          {queries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No named SQL queries yet</p>
              <p className="mt-2 text-sm text-black/55">
                Add rows to public.athena_sql_queries to store reusable SQL diagnostics.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {queries.map((query) => (
                <article
                  key={query.id}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(query.status)}`}>
                      {query.status}
                    </span>

                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${categoryBadge(query.category)}`}>
                      {query.category}
                    </span>

                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {query.query_type}
                    </span>

                    <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                      {query.project_key}
                    </span>

                    {query.module_key ? (
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                        {query.module_key}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-2xl font-semibold">{query.query_name}</h3>

                  <p className="mt-2 break-words font-mono text-xs text-black/35">
                    {query.query_key}
                  </p>

                  {query.build_session_title ? (
                    <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black/65">
                      {query.build_session_title}
                    </p>
                  ) : null}

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl bg-white p-5">
                      <p className="mb-2 text-sm font-medium">Purpose</p>
                      <p className="text-sm leading-6 text-black/60">
                        {query.purpose}
                      </p>
                    </div>

                    <div className="rounded-3xl bg-white p-5">
                      <p className="mb-2 text-sm font-medium">Expected result</p>
                      <p className="text-sm leading-6 text-black/60">
                        {query.expected_result || "No expected result recorded."}
                      </p>
                    </div>

                    <div className="rounded-3xl bg-white p-5">
                      <p className="mb-2 text-sm font-medium">Safety notes</p>
                      <p className="text-sm leading-6 text-black/60">
                        {query.safety_notes || "No safety notes recorded."}
                      </p>
                    </div>

                    <div className="rounded-3xl bg-white p-5">
                      <p className="mb-2 text-sm font-medium">Usage notes</p>
                      <p className="text-sm leading-6 text-black/60">
                        {query.usage_notes || "No usage notes recorded."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="mb-2 text-sm font-medium">SQL text</p>
                    <pre className="overflow-x-auto rounded-3xl bg-[#171717] p-5 text-sm leading-6 text-white">
                      <code>{query.sql_text}</code>
                    </pre>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena SQL Query Registry v1
        </footer>
      </section>
    </main>
  );
}