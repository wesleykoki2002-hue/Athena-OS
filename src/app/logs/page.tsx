import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock,
  Code2,
  Database,
  FileText,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type BuildLog = {
  id: string;
  product_key: string;
  session_title: string;
  completed: string[] | null;
  files_created: string[] | null;
  files_modified: string[] | null;
  database_changes: string[] | null;
  decisions: string[] | null;
  security_notes: string[] | null;
  missing: string[] | null;
  next_steps: string[] | null;
  hours_spent: number | null;
  estimated_remaining_hours: number | null;
  created_at: string;
};

type Project = {
  project_key: string;
  name: string;
};

function safeList(list: string[] | null | undefined) {
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

function LogSection({
  title,
  items,
  icon
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-3xl bg-[#f5f1ea] p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <p className="font-semibold">{title}</p>
      </div>

      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item} className="flex gap-2 text-sm leading-6 text-black/60">
            <span>•</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function LogsPage() {
  const supabase = createAthenaCoreClient();

  const { data: logs } = await supabase
    .from("athena_build_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<BuildLog[]>();

  const { data: projects } = await supabase
    .from("athena_projects")
    .select("project_key, name")
    .returns<Project[]>();

  const logList = logs || [];
  const projectMap = new Map((projects || []).map((project) => [project.project_key, project.name]));

  const totalHours = logList.reduce((sum, log) => {
    return sum + Number(log.hours_spent || 0);
  }, 0);

  const projectCount = new Set(logList.map((log) => log.product_key)).size;

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-8 text-[#171717]">
      <section className="mx-auto max-w-7xl">
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
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                <Brain className="h-4 w-4" />
                Athena CTO Memory
              </div>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                Build Logs
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
                This is the memory of what Athena CTO has recorded across your projects.
              </p>
            </div>

            <Link
              href="/update"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
            >
              <Sparkles className="h-4 w-4" />
              Record new update
            </Link>
          </div>
        </header>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <FileText className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Logs shown</p>
            <p className="mt-2 text-3xl font-semibold">{logList.length}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Code2 className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Projects touched</p>
            <p className="mt-2 text-3xl font-semibold">{projectCount}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Clock className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Hours recorded</p>
            <p className="mt-2 text-3xl font-semibold">{Math.round(totalHours)}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <ShieldCheck className="mb-4 h-6 w-6" />
            <p className="text-sm text-black/45">Memory source</p>
            <p className="mt-2 text-3xl font-semibold">CTO</p>
          </div>
        </div>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-black/45">Latest records</p>
              <h2 className="text-3xl font-semibold">Athena CTO timeline</h2>
            </div>
            <p className="text-sm text-black/45">
              Newest first.
            </p>
          </div>

          {logList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-[#fbfaf7] p-8 text-center">
              <p className="font-medium">No build logs found</p>
              <p className="mt-2 text-sm text-black/55">
                Use the Update UI to record your first Athena CTO update.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {logList.map((log) => {
                const projectName = projectMap.get(log.product_key) || log.product_key;

                return (
                  <article
                    key={log.id}
                    className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                  >
                    <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/projects/${log.product_key}`}
                            className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white transition hover:bg-black/80"
                          >
                            {projectName}
                          </Link>

                          <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/55">
                            <CalendarClock className="h-3 w-3" />
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>

                        <h3 className="text-2xl font-semibold">{log.session_title}</h3>
                      </div>

                      <div className="rounded-3xl bg-white p-4 text-sm md:min-w-56">
                        <div className="flex items-center justify-between">
                          <span className="text-black/45">Hours spent</span>
                          <span className="font-semibold">{Number(log.hours_spent || 0)}h</span>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-black/45">Remaining</span>
                          <span className="font-semibold">
                            {Number(log.estimated_remaining_hours || 0)}h
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <LogSection
                        title="Completed"
                        items={safeList(log.completed)}
                        icon={<CheckCircle2 className="h-5 w-5" />}
                      />

                      <LogSection
                        title="Next steps"
                        items={safeList(log.next_steps)}
                        icon={<Sparkles className="h-5 w-5" />}
                      />

                      <LogSection
                        title="Files created"
                        items={safeList(log.files_created)}
                        icon={<FileText className="h-5 w-5" />}
                      />

                      <LogSection
                        title="Files modified"
                        items={safeList(log.files_modified)}
                        icon={<Code2 className="h-5 w-5" />}
                      />

                      <LogSection
                        title="Database changes"
                        items={safeList(log.database_changes)}
                        icon={<Database className="h-5 w-5" />}
                      />

                      <LogSection
                        title="Decisions"
                        items={safeList(log.decisions)}
                        icon={<Brain className="h-5 w-5" />}
                      />

                      <LogSection
                        title="Security notes"
                        items={safeList(log.security_notes)}
                        icon={<ShieldCheck className="h-5 w-5" />}
                      />

                      <LogSection
                        title="Missing"
                        items={safeList(log.missing)}
                        icon={<Clock className="h-5 w-5" />}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena CTO Build Logs v1
        </footer>
      </section>
    </main>
  );
}