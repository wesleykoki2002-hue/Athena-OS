import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import type {
  CanonicalBuildIdentityKind,
  CanonicalBuildLifecycleLocalEvidence,
  CanonicalBuildLifecycleRequest,
} from "@/lib/build-lifecycle/types";
import {
  classifyCanonicalTargetSupabaseApplicability,
} from "@/lib/build-lifecycle/supabase-applicability";
import { createAthenaCoreClient } from "@/lib/supabase/server";

const execFileAsync = promisify(execFile);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40}$/;
const CONTROL_PLANE_PROJECT_REF = "voiwlcvfahykdldtjeqy";

type JsonRecord = Record<string, unknown>;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Required lifecycle environment setting is missing: ${name}`);
  }

  return value;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function ensureConsistentValues(
  label: string,
  values: string[],
  normalize: (value: string) => string = (value) => value,
): string {
  const populated = values.map((value) => value.trim()).filter(Boolean);

  if (populated.length === 0) {
    throw new Error(`No canonical ${label} is registered for this lifecycle request.`);
  }

  const normalized = new Set(populated.map(normalize));

  if (normalized.size !== 1) {
    throw new Error(`Canonical ${label} evidence is contradictory.`);
  }

  return populated[0];
}

async function runGit(
  repositoryPath: string,
  argumentsList: string[],
): Promise<string> {
  const result = await execFileAsync(
    "git",
    ["-C", repositoryPath, ...argumentsList],
    {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return result.stdout.trim();
}

async function loadCanonicalTarget(
  request: CanonicalBuildLifecycleRequest,
) {
  const supabase = createAthenaCoreClient();
  const [intakeResult, packageResult, projectResult] = await Promise.all([
    supabase
      .from("athena_intake_items")
      .select("id, project_key, module_key, status_key, source_reference, metadata")
      .eq("id", request.intakeId)
      .single(),
    supabase
      .from("athena_intake_preparation_packages")
      .select("id, intake_id, project_key, module_key, proposed_build_id, proposed_build_title, metadata")
      .eq("id", request.preparationPackageId)
      .single(),
    supabase
      .from("athena_projects")
      .select("project_key, blocked, repo_path, local_path, supabase_project_ref, metadata")
      .eq("project_key", request.projectKey)
      .single(),
  ]);

  if (intakeResult.error || !intakeResult.data) {
    throw new Error(
      `Unable to load the exact canonical Intake: ${intakeResult.error?.message || "not found"}`,
    );
  }

  if (packageResult.error || !packageResult.data) {
    throw new Error(
      `Unable to load the exact preparation package: ${packageResult.error?.message || "not found"}`,
    );
  }

  if (projectResult.error || !projectResult.data) {
    throw new Error(
      `Unable to load the canonical target project: ${projectResult.error?.message || "not found"}`,
    );
  }

  const intake = intakeResult.data as JsonRecord;
  const preparationPackage = packageResult.data as JsonRecord;
  const project = projectResult.data as JsonRecord;
  const intakeMetadata = asRecord(intake.metadata);
  const packageMetadata = asRecord(preparationPackage.metadata);
  const projectMetadata = asRecord(project.metadata);
  const targetSupabaseApplicability =
    classifyCanonicalTargetSupabaseApplicability(projectMetadata);

  if (
    intake.id !== request.intakeId ||
    intake.status_key !== "approved" ||
    intake.project_key !== request.projectKey ||
    intake.module_key !== request.moduleKey
  ) {
    throw new Error("The local-evidence request does not match the approved canonical Intake.");
  }

  if (
    preparationPackage.id !== request.preparationPackageId ||
    preparationPackage.intake_id !== request.intakeId ||
    preparationPackage.project_key !== request.projectKey ||
    preparationPackage.module_key !== request.moduleKey
  ) {
    throw new Error("The local-evidence request does not match its exact preparation package.");
  }

  if (project.project_key !== request.projectKey || project.blocked !== false) {
    throw new Error("The canonical target project is missing or blocked.");
  }

  const proposedBuildId = optionalText(preparationPackage.proposed_build_id);
  const proposedBuildTitle = optionalText(preparationPackage.proposed_build_title);

  if (Boolean(proposedBuildId) !== Boolean(proposedBuildTitle)) {
    throw new Error("The preparation-package build identity pair is contradictory.");
  }

  const buildIdentityKind: CanonicalBuildIdentityKind = proposedBuildId
    ? "external"
    : "numeric";

  const canonicalRepositoryPath = ensureConsistentValues(
    "target repository path",
    [
      optionalText(packageMetadata.repository_path),
      optionalText(intakeMetadata.repository_path),
      optionalText(project.repo_path),
      optionalText(project.local_path),
      optionalText(projectMetadata.local_folder),
    ],
    normalizedPath,
  );

  const targetSupabaseProjectRef = ensureConsistentValues(
    "target Supabase project reference",
    [
      optionalText(packageMetadata.supabase_project_ref),
      optionalText(intakeMetadata.supabase_project_ref),
      optionalText(project.supabase_project_ref),
      optionalText(projectMetadata.target_supabase_project_ref),
    ],
  );

  if (
    targetSupabaseApplicability.mode ===
      "repository_only_no_product_database" &&
    targetSupabaseProjectRef !== CONTROL_PLANE_PROJECT_REF
  ) {
    throw new Error(
      "Repository-only target Supabase evidence contradicts the Athena control-plane identity.",
    );
  }

  const canonicalHandoffVersion = ensureConsistentValues(
    "handoff version",
    [
      optionalText(packageMetadata.handoff_version),
      optionalText(intakeMetadata.handoff_version),
    ],
  );

  const packageHandoffFilename = optionalText(
    packageMetadata.handoff_filename,
  );
  const intakeHandoffFilename = optionalText(
    intakeMetadata.handoff_filename,
  );

  if (
    packageHandoffFilename &&
    intakeHandoffFilename &&
    packageHandoffFilename !== intakeHandoffFilename
  ) {
    throw new Error(
      "Preparation-package and Intake canonical handoff filenames contradict each other.",
    );
  }

  const explicitHandoffFilename =
    packageHandoffFilename ?? intakeHandoffFilename;

  const handoffFilenameSources = explicitHandoffFilename
    ? [explicitHandoffFilename]
    : [optionalText(intake.source_reference)].filter(
        (value): value is string => Boolean(value),
      );

  const handoffFilenames = handoffFilenameSources
    .flatMap((value) => [
      path.basename(value),
      path.win32.basename(value),
    ])
    .filter(Boolean);

  return {
    buildIdentityKind,
    canonicalBuildId: proposedBuildId || null,
    canonicalBuildTitle: proposedBuildTitle || null,
    canonicalRepositoryPath,
    targetSupabaseProjectRef,
    targetSupabaseApplicability,
    canonicalHandoffVersion,
    handoffFilenames: Array.from(new Set(handoffFilenames)),
  };
}

export async function verifyCanonicalBuildLifecycleLocalEvidence(
  request: CanonicalBuildLifecycleRequest,
): Promise<CanonicalBuildLifecycleLocalEvidence> {
  const target = await loadCanonicalTarget(request);
  const repositoryPath = path.resolve(
    requiredEnvironment("ATHENA_CANONICAL_REPOSITORY_PATH"),
  );
  const expectedRepositoryHead = requiredEnvironment(
    "ATHENA_CANONICAL_REPOSITORY_HEAD",
  ).toLowerCase();
  const handoffPath = path.resolve(
    requiredEnvironment("ATHENA_CANONICAL_HANDOFF_PATH"),
  );
  const handoffVersion = requiredEnvironment(
    "ATHENA_CANONICAL_HANDOFF_VERSION",
  );
  const expectedHandoffSha256 = requiredEnvironment(
    "ATHENA_CANONICAL_HANDOFF_SHA256",
  ).toLowerCase();
  const supabaseProjectRef = requiredEnvironment(
    "ATHENA_SUPABASE_PROJECT_REF",
  );

  if (normalizedPath(repositoryPath) !== normalizedPath(target.canonicalRepositoryPath)) {
    throw new Error(
      `Configured repository path does not match the canonical target. Expected ${target.canonicalRepositoryPath}; found ${repositoryPath}.`,
    );
  }

  if (!GIT_OBJECT_PATTERN.test(expectedRepositoryHead)) {
    throw new Error("Configured canonical repository HEAD is invalid.");
  }

  if (!SHA256_PATTERN.test(expectedHandoffSha256)) {
    throw new Error("Configured canonical handoff SHA-256 is invalid.");
  }

  if (supabaseProjectRef !== CONTROL_PLANE_PROJECT_REF) {
    throw new Error("Configured control-plane Supabase project identity is not Athena OS.");
  }


  if (handoffVersion !== target.canonicalHandoffVersion) {
    throw new Error(
      `Configured handoff version does not match the canonical package. Expected ${target.canonicalHandoffVersion}; found ${handoffVersion}.`,
    );
  }

  if (
    target.handoffFilenames.length > 0 &&
    !target.handoffFilenames.includes(path.basename(handoffPath)) &&
    !target.handoffFilenames.includes(path.win32.basename(handoffPath))
  ) {
    throw new Error("Configured handoff file does not match the canonical Intake source reference.");
  }

  const topLevel = path.resolve(
    await runGit(repositoryPath, ["rev-parse", "--show-toplevel"]),
  );

  if (normalizedPath(topLevel) !== normalizedPath(repositoryPath)) {
    throw new Error(
      `Repository root mismatch. Expected ${repositoryPath}; found ${topLevel}.`,
    );
  }

  const repositoryHead = (
    await runGit(repositoryPath, ["rev-parse", "HEAD"])
  ).toLowerCase();

  if (repositoryHead !== expectedRepositoryHead) {
    throw new Error(
      `Repository HEAD mismatch. Expected ${expectedRepositoryHead}; found ${repositoryHead}.`,
    );
  }

  const repositoryTree = (
    await runGit(repositoryPath, ["rev-parse", "HEAD^{tree}"])
  ).toLowerCase();
  const repositoryBranch = await runGit(repositoryPath, [
    "branch",
    "--show-current",
  ]);

  if (!GIT_OBJECT_PATTERN.test(repositoryTree)) {
    throw new Error("Canonical repository tree identity is invalid.");
  }

  if (!repositoryBranch) {
    throw new Error("Canonical repository is detached or has no verified branch.");
  }

  const trackedDiff = await runGit(repositoryPath, [
    "diff",
    "--no-ext-diff",
    "--name-only",
    "HEAD",
    "--",
    ".",
  ]);
  const stagedDiff = await runGit(repositoryPath, [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--name-only",
    "--",
    ".",
  ]);

  if (trackedDiff) {
    throw new Error(
      "Tracked repository changes exist. Canonical lifecycle execution is blocked.",
    );
  }

  if (stagedDiff) {
    throw new Error(
      "Staged repository changes exist. Canonical lifecycle execution is blocked.",
    );
  }

  const trackedIndex = await runGit(repositoryPath, ["ls-files", "-s"]);

  if (!trackedIndex) {
    throw new Error("Canonical repository contains no tracked-file evidence.");
  }

  let linkedTargetSupabaseProjectRef: string | null = null;
  let targetSupabaseRepositoryLinkVerified = false;

  if (target.targetSupabaseApplicability.mode === "database_backed") {
    const targetProjectRefPath = path.join(
      repositoryPath,
      "supabase",
      ".temp",
      "project-ref",
    );
    linkedTargetSupabaseProjectRef = (
      await readFile(targetProjectRefPath, "utf8")
    ).trim();

    if (linkedTargetSupabaseProjectRef !== target.targetSupabaseProjectRef) {
      throw new Error(
        `Target repository is linked to the wrong Supabase project. Expected ${target.targetSupabaseProjectRef}; found ${linkedTargetSupabaseProjectRef || "none"}.`,
      );
    }

    targetSupabaseRepositoryLinkVerified = true;
  }

  const targetSupabaseRepositoryEvidence =
    target.targetSupabaseApplicability.mode === "database_backed"
      ? `repository_link_verified:${linkedTargetSupabaseProjectRef}`
      : "repository_link_not_applicable";

  const repositoryEvidenceSha256 = sha256(
    [
      target.targetSupabaseApplicability.mode,
      repositoryBranch,
      repositoryHead,
      repositoryTree,
      target.targetSupabaseProjectRef,
      targetSupabaseRepositoryEvidence,
      trackedIndex,
    ].join("\n"),
  );

  const handoffBytes = await readFile(handoffPath);
  const actualHandoffSha256 = sha256(handoffBytes);

  if (actualHandoffSha256 !== expectedHandoffSha256) {
    throw new Error(
      `Canonical handoff checksum mismatch. Expected ${expectedHandoffSha256}; found ${actualHandoffSha256}.`,
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  if (!supabaseUrl.includes(supabaseProjectRef)) {
    throw new Error(
      "The configured Supabase URL does not match the Athena OS control-plane project.",
    );
  }

  return {
    buildIdentityKind: target.buildIdentityKind,
    canonicalBuildId: target.canonicalBuildId,
    canonicalBuildTitle: target.canonicalBuildTitle,
    handoffPath,
    handoffVersion,
    handoffSha256: actualHandoffSha256,
    repositoryPath,
    repositoryBranch,
    repositoryHead,
    repositoryTree,
    repositoryEvidenceSha256,
    supabaseProjectRef,
    targetSupabaseProjectRef: target.targetSupabaseProjectRef,
    targetSupabaseApplicability: target.targetSupabaseApplicability.mode,
    targetSupabaseProjectVerified: true,
    targetSupabaseRepositoryLinkVerified,
    targetSupabaseUsage: target.targetSupabaseApplicability.supabaseUsage,
    productDatabase: target.targetSupabaseApplicability.productDatabase,
    trackedDiffEmpty: true,
    stagedDiffEmpty: true,
  };
}
