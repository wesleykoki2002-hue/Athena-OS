import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Clock,
  Code2,
  Layers3,
  Rocket,
  Sparkles,
  Zap
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type ComponentPageProps = {
  params: Promise<{
    componentKey: string;
  }>;
};

type ReusableComponent = {
  component_key?: string;
  name?: string;
  description?: string | null;
  component_type?: string | null;
  type?: string | null;
  status?: string | null;
  reusable_in_projects?: string[] | null;
  used_by_projects?: string[] | null;
  projects?: string[] | null;
  hours_saved_estimate?: number | null;
  estimated_hours_saved?: number | null;
  hours_saved?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function asText(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim().length > 0) return value;
  return fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) return Number(value);
  return fallback;
}

function asList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function prettyProjectName(projectKey: string) {
  const names: Record<string, string> = {
    "athena-os": "Athena OS",
    "athena-cto": "Athena CTO",
    "athena-business-os": "Athena Business OS",
    beautydna: "BeautyDNA",
    "hanna-japan-store": "Hanna Japan Store",
    "hanna-commerce-os": "Hanna Commerce OS",
    "general-product-importer": "General Product Importer",
    "beauty-product-importer": "Beauty Product Importer",
    "shigoto-doko": "Shigoto Doko",
    kanjido: "KANJIDŌ",
    "sakura-chronicles": "Sakura Chronicles"
  };

  return names[projectKey] || projectKey;
}

export default async function ReusableComponentDetailPage({ params }: ComponentPageProps) {
  const { componentKey } = await params;

  const supabase = createAthenaCoreClient();

  const { data } = await supabase
    .from("athena_reusable_components")
    .select("*")
    .eq("component_key", componentKey)
    .maybeSingle<ReusableComponent>();

  const component: ReusableComponent = data || {
    component_key: componentKey,
    name: componentKey,
    description: "This reusable component was not loaded from Supabase, but the route is working.",
    component_type: "unknown",
    status: "unknown",
    hours_saved_estimate: 0,
    reusable_in_projects: []
  };

  const name = asText(component.name, componentKey);
  const description = asText(component.description, "No description yet.");
  const type = asText(component.component_type || component.type, "Reusable system");
  const status = asText(component.status, "unknown");

  const hoursSaved = asNumber(
    component.hours_saved_estimate ??
      component.estimated_hours_saved ??
      component.hours_saved,
    0
  );

  const reusableProjects = asList(
    component.reusable_in_projects ??
      component.used_by_projects ??
      component.projects
  );

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/reusable"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to reusable components
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
            <Zap className="h-4 w-4" />
            Reusable Component
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            {name}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            {description}
          </p>
          <Link
            href={`/reusable/${componentKey}/edit`}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
          >
            <Sparkles className="h-4 w-4" />
            Edit Component
          </Link>
        </header>

        {!data ? (
          <div className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            The page route is working, but this component was not loaded from Supabase.
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Code2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Component key</p>
            <p className="mt-2 break-words text-lg font-semibold">{component.component_key || componentKey}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Layers3 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Type</p>
            <p className="mt-2 text-lg font-semibold">{type}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Rocket className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Status</p>
            <p className="mt-2 text-lg font-semibold">{status}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Hours saved</p>
            <p className="mt-2 text-3xl font-semibold">{Math.round(hoursSaved)}</p>
          </div>
        </div>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
              <Sparkles className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm font-medium text-black/45">Reuse map</p>
              <h2 className="text-3xl font-semibold">Where this can be reused</h2>
            </div>
          </div>

          {reusableProjects.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No reuse projects listed yet</p>
              <p className="mt-2 text-sm text-black/55">
                Later we will add editing so you can attach this component to more projects.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {reusableProjects.map((projectKey) => (
                <Link
                  key={projectKey}
                  href={`/projects/${projectKey}`}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-5 transition hover:bg-[#f5f1ea]"
                >
                  <p className="text-sm text-black/45">Project</p>
                  <p className="mt-2 text-xl font-semibold">{prettyProjectName(projectKey)}</p>
                  <p className="mt-2 text-sm text-black/50">{projectKey}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <Brain className="h-6 w-6" />
            <h2 className="text-3xl font-semibold">Athena CTO Notes</h2>
          </div>

          <p className="rounded-[2rem] bg-[#f5f1ea] p-6 leading-7 text-black/65">
            {asText(component.notes, "No notes yet.")}
          </p>
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena Reusable Component Detail v1
        </footer>
      </section>
    </main>
  );
}