import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCheck,
  Database,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  Route,
  ShieldCheck,
  Sparkles
} from "lucide-react";

const workflowSteps = [
  {
    number: "01",
    title: "Open Daily Command Center",
    description:
      "Start from the Athena OS homepage. Check the recommended project, next step, blockers, and latest build memory.",
    href: "/",
    cta: "Open Home",
    icon: LayoutDashboard
  },
  {
    number: "02",
    title: "Confirm next build",
    description:
      "Use the CTO Next-Step screen to confirm what should be built next. This prevents Athena OS, Athena CTO, BeautyDNA, Hanna, and Athena Business OS from getting mixed.",
    href: "/next",
    cta: "Open Next Step",
    icon: Route
  },
  {
    number: "03",
    title: "Build the feature",
    description:
      "Create or update the files, routes, SQL, and actions required for the selected feature. Keep one build session focused on one feature.",
    href: "/logs",
    cta: "Open Build Logs",
    icon: FileText
  },
  {
    number: "04",
    title: "Run QA",
    description:
      "Create a QA run, use the correct feature type, and confirm the feature has no pending or failed checks before it is treated as closed.",
    href: "/qa",
    cta: "Open QA Center",
    icon: ListChecks
  },
  {
    number: "05",
    title: "Preview QA prefill if needed",
    description:
      "Before applying a QA template, preview how standard_app_feature, read_only_ui, homepage_shortcut, or database_registry_change will affect the QA checks.",
    href: "/qa-prefill-preview",
    cta: "Preview QA Prefill",
    icon: Sparkles
  },
  {
    number: "06",
    title: "Complete the feature",
    description:
      "Use the Feature Completion Command Center to create the packet, create QA, prefill checks, record CTO update, close memory, and create completion history.",
    href: "/complete-feature",
    cta: "Complete Feature",
    icon: ClipboardCheck
  },
  {
    number: "07",
    title: "Review completion history",
    description:
      "Confirm the feature is completed, CTO recorded is true, and memory check closed is true. Repair or retry any incomplete completion event.",
    href: "/completion-history",
    cta: "Open History",
    icon: History
  },
  {
    number: "08",
    title: "Check database changes",
    description:
      "If the build touched Supabase schema, functions, views, policies, triggers, or SQL queries, register the object so Athena can track it.",
    href: "/database-map",
    cta: "Open DB Map",
    icon: Database
  },
  {
    number: "09",
    title: "Run internal MVP audit",
    description:
      "Use the internal audit page to confirm there are no open QA blockers or incomplete feature completion events before moving to the next phase.",
    href: "/internal-mvp-audit",
    cta: "Open Audit",
    icon: ShieldCheck
  }
];

const rules = [
  "One build session = one feature.",
  "Never record secret values in Athena logs.",
  "Do not hardcode planning numbers unless they are verified from the database.",
  "Always close QA before calling a feature done.",
  "If a feature touches security, protect the route and verify the guard.",
  "If a feature touches Supabase, register the database change.",
  "If a feature gets stuck, use Completion History repair before duplicating records.",
  "Do not mix Athena OS, Athena CTO, Athena Business OS, BeautyDNA, Hanna, or other projects."
];

export default function OperatorWorkflowPage() {
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
            href="/internal-mvp-audit"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ShieldCheck className="h-4 w-4" />
            Internal MVP Audit
          </Link>

          <Link
            href="/complete-feature"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition hover:text-black"
          >
            <ClipboardCheck className="h-4 w-4" />
            Complete Feature
          </Link>
        </div>

        <header className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <Sparkles className="h-4 w-4" />
            Athena OS Operator Workflow
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            How to use Athena without mixing projects
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/60">
            This is the daily operating flow for building with Athena OS. Follow this order so every feature is planned, built, checked, recorded, and remembered correctly.
          </p>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[2rem] border border-green-200 bg-green-50 p-6">
            <p className="text-sm font-medium text-green-700/70">Current phase</p>
            <p className="mt-2 text-3xl font-semibold text-green-900">
              Internal MVP ready
            </p>
            <p className="mt-3 text-sm leading-6 text-green-800/80">
              Use this flow before starting the next project phase.
            </p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6">
            <p className="text-sm font-medium text-black/45">Main rule</p>
            <p className="mt-2 text-3xl font-semibold">
              One feature at a time
            </p>
            <p className="mt-3 text-sm leading-6 text-black/55">
              Close QA and completion history before moving forward.
            </p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6">
            <p className="text-sm font-medium text-black/45">Security mode</p>
            <p className="mt-2 text-3xl font-semibold">
              Operator guarded
            </p>
            <p className="mt-3 text-sm leading-6 text-black/55">
              Athena OS uses the operator guard and server-side service role client.
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Daily workflow</p>
            <h2 className="text-3xl font-semibold">Build operating sequence</h2>
          </div>

          <div className="grid gap-5">
            {workflowSteps.map((step) => {
              const Icon = step.icon;

              return (
                <article
                  key={step.number}
                  className="rounded-[2rem] border border-black/10 bg-[#fbfaf7] p-6"
                >
                  <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black text-lg font-semibold text-white">
                      {step.number}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className="h-5 w-5 text-black/55" />
                        <h3 className="text-2xl font-semibold">{step.title}</h3>
                      </div>

                      <p className="max-w-3xl text-sm leading-6 text-black/60">
                        {step.description}
                      </p>
                    </div>

                    <Link
                      href={step.href}
                      className="inline-flex items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
                    >
                      {step.cta}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-black/45">Operator rules</p>
            <h2 className="text-3xl font-semibold">Do not break these rules</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {rules.map((rule) => (
              <div
                key={rule}
                className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm leading-6 text-black/65"
              >
                {rule}
              </div>
            ))}
          </div>
        </section>

        <footer className="py-8 text-center text-sm text-black/40">
          Athena OS Operator Workflow v1
        </footer>
      </section>
    </main>
  );
}