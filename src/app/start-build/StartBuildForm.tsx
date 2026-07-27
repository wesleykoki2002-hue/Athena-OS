"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

export type ProjectOption = {
  project_key: string;
  name: string;
  priority: string;
  status: string;
};

export type ProjectModuleOption = {
  id: string;
  project_key: string;
  module_key: string;
  name: string;
  priority: string;
  status: string;
};

type StartBuildValues = {
  projectKey: string;
  moduleKey: string;
  intakeId: string;
  preparationPackageId: string;
  buildId: string;
  buildTitle: string;
  targetSystem: string;
  trackingSystem: string;
  localFolder: string;
  goal: string;
  separationNotes: string;
};

type StartBuildFormProps = {
  projects: ProjectOption[];
  modules: ProjectModuleOption[];
  initialValues: StartBuildValues;
  registryError: string | null;
};

export default function StartBuildForm({
  projects,
  modules,
  initialValues,
  registryError
}: StartBuildFormProps) {
  const validInitialProjectKey = projects.some(
    (project) => project.project_key === initialValues.projectKey
  )
    ? initialValues.projectKey
    : "";

  const validInitialModuleKey = modules.some(
    (moduleItem) =>
      moduleItem.project_key === validInitialProjectKey &&
      moduleItem.module_key === initialValues.moduleKey
  )
    ? initialValues.moduleKey
    : "";

  const [projectKey, setProjectKey] = useState(validInitialProjectKey);
  const [moduleKey, setModuleKey] = useState(validInitialModuleKey);

  const selectedProject =
    projects.find((project) => project.project_key === projectKey) || null;

  const availableModules = useMemo(
    () =>
      modules.filter(
        (moduleItem) => moduleItem.project_key === projectKey
      ),
    [modules, projectKey]
  );

  const registryUnavailable =
    Boolean(registryError) || projects.length === 0;

  function handleProjectChange(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    setProjectKey(event.target.value);

    // A module belongs to exactly one canonical project.
    // Always clear it when the project changes.
    setModuleKey("");
  }

  return (
    <>
      {registryError ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {registryError}
        </div>
      ) : null}

      {!registryError && projects.length === 0 ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No projects are registered in public.athena_projects. The build
          starter will not create projects automatically.
        </div>
      ) : null}

      <form
        action="/start-build"
        method="get"
        className="grid gap-4 md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-black/70">
            Project
          </label>

          <select
            name="project_key"
            value={projectKey}
            onChange={handleProjectChange}
            required
            disabled={registryUnavailable}
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select a registered project</option>

            {projects.map((project) => (
              <option
                key={project.project_key}
                value={project.project_key}
              >
                {project.name} | {project.priority} | {project.status}
              </option>
            ))}
          </select>

          <p className="mt-1 text-xs text-black/35">
            Projects come only from public.athena_projects.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Project name
          </label>

          <input
            value={selectedProject?.name || ""}
            readOnly
            aria-readonly="true"
            placeholder="Select a registered project"
            className="w-full rounded-2xl border border-black/10 bg-black/[0.03] px-4 py-3 text-black/65 outline-none"
          />

          <input
            type="hidden"
            name="project_name"
            value={selectedProject?.name || ""}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Project key
          </label>

          <input
            value={selectedProject?.project_key || ""}
            readOnly
            aria-readonly="true"
            placeholder="Canonical project key"
            className="w-full rounded-2xl border border-black/10 bg-black/[0.03] px-4 py-3 font-mono text-black/65 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-black/70">
            Module key
          </label>

          <select
            name="module_key"
            value={moduleKey}
            onChange={(event) => setModuleKey(event.target.value)}
            required
            disabled={
              registryUnavailable ||
              !selectedProject ||
              availableModules.length === 0
            }
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">
              {!selectedProject
                ? "Select a project first"
                : availableModules.length === 0
                  ? "No registered modules for this project"
                  : "Select a registered module"}
            </option>

            {availableModules.map((moduleItem) => (
              <option
                key={`${moduleItem.project_key}-${moduleItem.module_key}`}
                value={moduleItem.module_key}
              >
                {moduleItem.name} | {moduleItem.module_key} |{" "}
                {moduleItem.priority} | {moduleItem.status}
              </option>
            ))}
          </select>

          <p className="mt-1 text-xs text-black/35">
            Only modules registered for the selected project are shown.
          </p>
        </div>

        <div className="md:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">
            Governed lifecycle evidence
          </p>
          <p className="mt-1 text-xs leading-5 text-blue-800/80">
            These UUIDs identify the approved Intake and its exact preparation
            package. They are required only when the separate governed
            assignment/start action is used. They never assign a build by
            themselves.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Approved Intake ID
          </label>

          <input
            name="intake_id"
            defaultValue={initialValues.intakeId}
            placeholder="Canonical approved Intake UUID"
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 font-mono outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Preparation package ID
          </label>

          <input
            name="preparation_package_id"
            defaultValue={initialValues.preparationPackageId}
            placeholder="Exact zero-build-ID package UUID"
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 font-mono outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Build ID
          </label>

          <input
            name="build_id"
            defaultValue={initialValues.buildId}
            required
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 font-mono outline-none focus:border-black"
          />

          <p className="mt-1 text-xs text-black/35">
            Prompt-generation field only. The governed lifecycle ignores this
            value and derives the canonical build ID under database locking.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Build title
          </label>

          <input
            name="build_title"
            defaultValue={initialValues.buildTitle}
            required
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Target system
          </label>

          <input
            name="target_system"
            defaultValue={initialValues.targetSystem}
            required
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-black/70">
            Tracking system
          </label>

          <input
            name="tracking_system"
            defaultValue={initialValues.trackingSystem}
            required
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-black/70">
            Local folder
          </label>

          <input
            name="local_folder"
            defaultValue={initialValues.localFolder}
            required
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 font-mono outline-none focus:border-black"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-black/70">
            Goal
          </label>

          <textarea
            name="goal"
            rows={4}
            defaultValue={initialValues.goal}
            required
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-black/70">
            Separation notes
          </label>

          <textarea
            name="separation_notes"
            rows={5}
            defaultValue={initialValues.separationNotes}
            required
            className="w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <button
          type="submit"
          disabled={
            registryUnavailable ||
            !selectedProject ||
            !moduleKey
          }
          className="md:col-span-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          Generate Starter Prompt
        </button>
      </form>
    </>
  );
}
