import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { CompletionPacket } from "../completion-packets";
import type {
  ExternalProjectRepositoryOnlyProfile,
} from "./external-project-repository-only-profile";

const execFileAsync = promisify(execFile);
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type ExternalProjectRepositoryOnlyAutomaticQaStatus =
  | "pass"
  | "warning"
  | "fail"
  | "pending"
  | "not_applicable";

export type ExternalProjectRepositoryOnlyAutomaticQaUpdate = {
  status: ExternalProjectRepositoryOnlyAutomaticQaStatus;
  actual_result: string;
  notes: string;
  evidence: Record<string, unknown>;
};

export type ExternalProjectRepositoryOnlyEvidence = {
  repositoryPath: string;
  repositoryRemote: string;
  repositoryBranch: string;
  repositoryHead: string;
  repositoryTree: string;
  repositoryStatusClean: true;
  trackedIndexSha256: string;
  requiredFiles: {
    relativePath: string;
    sha256: string;
  }[];
  validationEvidenceRelativePath: string;
  validationEvidenceSha256: string;
  validation: {
    pythonUnittestTotal: number;
    pythonUnittestPassed: number;
    pythonUnittestFailed: number;
    canonicalDraft202012SchemaVerified: boolean;
    cliValidationPassed: boolean;
    approvalChecksBlockedAsExpected: boolean;
    blockedApproveExitedNonzero: boolean;
    campaignShaPreserved: boolean;
    ledgerShaPreserved: boolean;
    deterministicPreflightVerified: boolean;
  };
  callableContractVerified: true;
  evidenceSha256: string;
};

function update(
  status: ExternalProjectRepositoryOnlyAutomaticQaStatus,
  actualResult: string,
  notes: string,
  evidence: Record<string, unknown>,
): ExternalProjectRepositoryOnlyAutomaticQaUpdate {
  return {
    status,
    actual_result: actualResult,
    notes,
    evidence: {
      automatic_qa: true,
      evidence_version: "0083-automatic-qa-evidence-v1",
      external_project_evidence_version:
        "external-project-repository-only-v1",
      ...evidence,
    },
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(
  label: string,
  actual: unknown,
  expected: unknown,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label} mismatch. Expected ${String(expected)}; found ${String(actual)}.`,
    );
  }
}

function assertSha256(label: string, value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`${label} is not a valid SHA-256 identity.`);
  }
}

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32"
    ? resolved.toLowerCase()
    : resolved;
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

async function runGitBytes(
  repositoryPath: string,
  argumentsList: string[],
): Promise<Buffer> {
  const result = await execFileAsync(
    "git",
    ["-C", repositoryPath, ...argumentsList],
    {
      encoding: "buffer",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return Buffer.from(result.stdout);
}

function safeRepositoryFilePath(
  repositoryPath: string,
  relativePath: string,
): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    normalized.trim() === ""
  ) {
    throw new Error(
      `External repository file path is outside the approved scope: ${relativePath}`,
    );
  }

  const resolved = path.resolve(
    repositoryPath,
    ...normalized.split("/"),
  );
  const rootWithSeparator = repositoryPath.endsWith(path.sep)
    ? repositoryPath
    : `${repositoryPath}${path.sep}`;

  if (
    !normalizedPath(resolved).startsWith(
      normalizedPath(rootWithSeparator),
    )
  ) {
    throw new Error(
      `External repository file path escaped its repository: ${relativePath}`,
    );
  }

  return resolved;
}

function safeAthenaEvidencePath(
  athenaRepoRoot: string,
  relativePath: string,
): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    !normalized.startsWith("evidence/external-projects/") ||
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(
      `Repository-only evidence path is outside the canonical Athena evidence root: ${relativePath}`,
    );
  }

  return safeRepositoryFilePath(athenaRepoRoot, normalized);
}

async function resolveRepositoryPath(
  profile: ExternalProjectRepositoryOnlyProfile,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const configured = environment[
    profile.target.repositoryPathEnvironment
  ]?.trim();

  const candidates = [
    ...(configured ? [configured] : []),
    ...profile.target.repositoryPathFallbacks,
  ];

  for (const candidate of candidates) {
    try {
      const candidatePath = path.resolve(candidate);
      const candidateStat = await stat(candidatePath);
      if (candidateStat.isDirectory()) {
        return candidatePath;
      }
    } catch {
      // Continue through governed path candidates.
    }
  }

  throw new Error(
    `No governed repository path is available for ${profile.profileKey}. Set ${profile.target.repositoryPathEnvironment} or restore a registered fallback path.`,
  );
}

function assertExactStringSet(
  label: string,
  actualValues: readonly string[],
  expectedValues: readonly string[],
): void {
  const actual = [...actualValues].sort();
  const expected = [...expectedValues].sort();

  if (
    actual.length !== new Set(actual).size ||
    expected.length !== new Set(expected).size ||
    JSON.stringify(actual) !== JSON.stringify(expected)
  ) {
    throw new Error(`${label} does not match the governed profile.`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is not a non-empty string.`);
  }
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${label} is not a non-negative integer.`);
  }
  return Number(value);
}

function asTrue(value: unknown, label: string): true {
  if (value !== true) {
    throw new Error(`${label} must be true.`);
  }
  return true;
}

function parseValidationEvidence(
  profile: ExternalProjectRepositoryOnlyProfile,
  bytes: Uint8Array,
) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Repository-only validation evidence is not valid JSON.");
  }

  const root = asRecord(parsed, "Repository-only validation evidence");
  assertEqual(
    "Repository-only evidence version",
    root.evidence_version,
    profile.validationEvidence.evidenceVersion,
  );

  const source = asRecord(root.source, "Repository-only source");
  assertEqual(
    "Repository-only build id",
    source.build_id,
    profile.validationEvidence.buildId,
  );
  assertEqual(
    "Repository-only project key",
    source.project_key,
    profile.packetIdentity.project_key,
  );
  assertEqual(
    "Repository-only module key",
    source.module_key,
    profile.packetIdentity.module_key,
  );
  assertEqual(
    "Repository-only build title",
    source.build_session_title,
    profile.packetIdentity.build_session_title,
  );

  const repository = asRecord(root.repository, "Repository-only repository");
  assertEqual("Repository evidence remote", repository.remote, profile.target.repositoryRemote);
  assertEqual("Repository evidence branch", repository.branch, profile.target.repositoryBranch);
  assertEqual("Repository evidence commit", repository.commit, profile.target.repositoryHead);
  assertEqual("Repository evidence tree", repository.tree, profile.target.repositoryTree);
  asTrue(repository.remote_commit_verified, "Repository remote commit verification");
  asTrue(repository.repository_clean, "Repository clean assertion");

  const committedFiles = repository.committed_files;
  if (!Array.isArray(committedFiles) || !committedFiles.every((item) => typeof item === "string")) {
    throw new Error("Repository committed_files is not a string array.");
  }
  assertExactStringSet(
    "Repository committed files",
    committedFiles as string[],
    profile.expectedChangedFiles,
  );

  const files = root.files;
  if (!Array.isArray(files)) {
    throw new Error("Repository-only files evidence is not an array.");
  }
  const fileMap = new Map<string, string>();
  for (const item of files) {
    const record = asRecord(item, "Repository-only file evidence");
    const relativePath = asString(record.path, "Repository-only file path");
    const fileSha = asString(record.sha256, "Repository-only file SHA-256");
    assertSha256(`Repository-only file SHA-256 ${relativePath}`, fileSha);
    if (fileMap.has(relativePath)) {
      throw new Error(`Repository-only file evidence duplicates ${relativePath}.`);
    }
    fileMap.set(relativePath, fileSha);
  }

  assertExactStringSet(
    "Repository-only file evidence paths",
    [...fileMap.keys()],
    profile.requiredFiles.map((file) => file.relativePath),
  );
  for (const expectedFile of profile.requiredFiles) {
    assertEqual(
      `Repository-only evidence file SHA-256 ${expectedFile.relativePath}`,
      fileMap.get(expectedFile.relativePath),
      expectedFile.sha256,
    );
  }

  const validation = asRecord(root.validation, "Repository-only validation");
  const pythonUnittestTotal = asInteger(
    validation.python_unittest_total,
    "Python unit-test total",
  );
  const pythonUnittestPassed = asInteger(
    validation.python_unittest_passed,
    "Python unit-test passed count",
  );
  const pythonUnittestFailed = asInteger(
    validation.python_unittest_failed,
    "Python unit-test failed count",
  );

  assertEqual(
    "Python unit-test total",
    pythonUnittestTotal,
    profile.validationEvidence.expectedUnitTestCount,
  );
  assertEqual("Python unit-test passed count", pythonUnittestPassed, pythonUnittestTotal);
  assertEqual("Python unit-test failed count", pythonUnittestFailed, 0);

  for (const field of profile.validationEvidence.requiredTrueFields) {
    asTrue(validation[field], `Required validation ${field}`);
  }

  const assertions = asRecord(root.assertions, "Repository-only assertions");
  assertEqual("Repository-only product database", assertions.product_database, "none");
  assertEqual("Repository-only database evidence requirement", assertions.database_evidence_required, false);
  assertEqual("Repository-only QA repository-write assertion", assertions.repository_write_performed_by_automatic_qa, false);
  assertEqual("Repository-only QA database-write assertion", assertions.database_write_performed_by_automatic_qa, false);
  assertEqual("Repository-only manual QA assertion", assertions.manual_qa_pass_used, false);
  assertEqual("Repository-only secret assertion", assertions.secret_values_recorded, false);

  return {
    pythonUnittestTotal,
    pythonUnittestPassed,
    pythonUnittestFailed,
    canonicalDraft202012SchemaVerified:
      validation.canonical_draft_2020_12_schema_verified === true,
    cliValidationPassed:
      validation.cli_validation_passed === true,
    approvalChecksBlockedAsExpected:
      validation.approval_checks_blocked_as_expected === true,
    blockedApproveExitedNonzero:
      validation.blocked_approve_exited_nonzero === true,
    campaignShaPreserved:
      validation.campaign_sha_preserved === true,
    ledgerShaPreserved:
      validation.ledger_sha_preserved === true,
    deterministicPreflightVerified:
      validation.deterministic_preflight_verified === true,
  };
}

export async function verifyExternalProjectRepositoryOnlyEvidence(
  profile: ExternalProjectRepositoryOnlyProfile,
  athenaRepoRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ExternalProjectRepositoryOnlyEvidence> {
  if (!GIT_OBJECT_PATTERN.test(profile.target.repositoryHead)) {
    throw new Error("Repository-only profile HEAD is invalid.");
  }
  if (!GIT_OBJECT_PATTERN.test(profile.target.repositoryTree)) {
    throw new Error("Repository-only profile tree is invalid.");
  }

  const repositoryPath = await resolveRepositoryPath(profile, environment);
  const topLevel = path.resolve(
    await runGit(repositoryPath, ["rev-parse", "--show-toplevel"]),
  );
  if (normalizedPath(topLevel) !== normalizedPath(repositoryPath)) {
    throw new Error(
      `Repository-only root mismatch. Expected ${repositoryPath}; found ${topLevel}.`,
    );
  }

  const [
    repositoryRemote,
    repositoryBranch,
    repositoryHead,
    repositoryTree,
    repositoryStatus,
    trackedIndex,
  ] = await Promise.all([
    runGit(repositoryPath, ["remote", "get-url", "origin"]),
    runGit(repositoryPath, ["branch", "--show-current"]),
    runGit(repositoryPath, ["rev-parse", "HEAD"]),
    runGit(repositoryPath, ["rev-parse", "HEAD^{tree}"]),
    runGit(repositoryPath, ["status", "--porcelain=v1", "--untracked-files=all"]),
    runGit(repositoryPath, ["ls-files", "-s"]),
  ]);

  assertEqual("Repository-only remote", repositoryRemote, profile.target.repositoryRemote);
  assertEqual("Repository-only branch", repositoryBranch, profile.target.repositoryBranch);
  assertEqual("Repository-only HEAD", repositoryHead.toLowerCase(), profile.target.repositoryHead);
  assertEqual("Repository-only tree", repositoryTree.toLowerCase(), profile.target.repositoryTree);

  if (repositoryStatus) {
    throw new Error("Repository-only target repository is not clean.");
  }
  if (!trackedIndex) {
    throw new Error("Repository-only target repository has no tracked-file evidence.");
  }

  const requiredFiles = [];
  const committedFileBytes = new Map<string, Buffer>();
  for (const expectedFile of profile.requiredFiles) {
    assertSha256(`Expected file SHA-256 ${expectedFile.relativePath}`, expectedFile.sha256);
    safeRepositoryFilePath(repositoryPath, expectedFile.relativePath);
    const bytes = await runGitBytes(repositoryPath, [
      "cat-file",
      "blob",
      `HEAD:${expectedFile.relativePath}`,
    ]);
    const actualSha = sha256(bytes);
    assertEqual(`Repository-only committed file SHA-256 ${expectedFile.relativePath}`, actualSha, expectedFile.sha256);
    committedFileBytes.set(expectedFile.relativePath, bytes);
    requiredFiles.push({
      relativePath: expectedFile.relativePath,
      sha256: actualSha,
    });
  }

  const callableFile = profile.requiredFiles.find(
    (file) => file.relativePath === profile.callableContract.relativePath,
  );
  if (!callableFile) {
    throw new Error("Callable contract file is not part of the required-file profile.");
  }
  const callableBytes = committedFileBytes.get(
    profile.callableContract.relativePath,
  );
  if (!callableBytes) {
    throw new Error("Callable contract committed bytes are unavailable.");
  }
  const callableContent = callableBytes.toString("utf8");
  for (const token of profile.callableContract.requiredTokens) {
    if (!callableContent.includes(token)) {
      throw new Error(`Callable contract token is missing: ${token}`);
    }
  }

  const evidencePath = safeAthenaEvidencePath(
    athenaRepoRoot,
    profile.validationEvidence.relativePath,
  );
  const evidenceBytes = await readFile(evidencePath);
  const validationEvidenceSha256 = sha256(evidenceBytes);
  assertEqual(
    "Repository-only validation evidence SHA-256",
    validationEvidenceSha256,
    profile.validationEvidence.sha256,
  );
  const validation = parseValidationEvidence(profile, evidenceBytes);

  const trackedIndexSha256 = sha256(trackedIndex);
  const evidenceSha256 = sha256(
    JSON.stringify({
      repositoryPath: normalizedPath(repositoryPath),
      repositoryRemote,
      repositoryBranch,
      repositoryHead: repositoryHead.toLowerCase(),
      repositoryTree: repositoryTree.toLowerCase(),
      trackedIndexSha256,
      requiredFiles,
      validationEvidenceRelativePath: profile.validationEvidence.relativePath,
      validationEvidenceSha256,
      validation,
      callableContractVerified: true,
    }),
  );

  return {
    repositoryPath,
    repositoryRemote,
    repositoryBranch,
    repositoryHead: repositoryHead.toLowerCase(),
    repositoryTree: repositoryTree.toLowerCase(),
    repositoryStatusClean: true,
    trackedIndexSha256,
    requiredFiles,
    validationEvidenceRelativePath: profile.validationEvidence.relativePath,
    validationEvidenceSha256,
    validation,
    callableContractVerified: true,
    evidenceSha256,
  };
}

export function buildExternalProjectRepositoryOnlyAutomaticQaUpdates(input: {
  profile: ExternalProjectRepositoryOnlyProfile;
  packet: Pick<CompletionPacket, "id" | "project_key" | "module_key" | "build_session_title" | "files_changed">;
  evidence: ExternalProjectRepositoryOnlyEvidence;
}): Record<string, ExternalProjectRepositoryOnlyAutomaticQaUpdate> {
  const { profile, packet, evidence } = input;

  assertEqual("Repository-only packet project", packet.project_key, profile.packetIdentity.project_key);
  assertEqual("Repository-only packet module", packet.module_key, profile.packetIdentity.module_key);
  assertEqual("Repository-only packet build title", packet.build_session_title, profile.packetIdentity.build_session_title);
  if (profile.packetIdentity.id !== undefined) {
    assertEqual("Repository-only packet id", packet.id, profile.packetIdentity.id);
  }
  assertExactStringSet("Repository-only packet files_changed", packet.files_changed, profile.expectedChangedFiles);

  const commonEvidence = {
    source: "external_project_repository_only_evidence",
    profile_key: profile.profileKey,
    completion_packet_id: packet.id,
    project_key: packet.project_key,
    module_key: packet.module_key,
    build_session_title: packet.build_session_title,
    build_id: profile.validationEvidence.buildId,
    product_database: "none",
    repository_remote: evidence.repositoryRemote,
    repository_branch: evidence.repositoryBranch,
    repository_head: evidence.repositoryHead,
    repository_tree: evidence.repositoryTree,
    repository_clean: evidence.repositoryStatusClean,
    repository_evidence_sha256: evidence.evidenceSha256,
    validation_evidence_relative_path: evidence.validationEvidenceRelativePath,
    validation_evidence_sha256: evidence.validationEvidenceSha256,
    required_files: evidence.requiredFiles,
  };

  const buildId = profile.validationEvidence.buildId;
  const callablePath = profile.callableContract.relativePath;
  const calculationUpdate: Record<
    string,
    ExternalProjectRepositoryOnlyAutomaticQaUpdate
  > =
    profile.validationEvidence.resolveCalculationFromValidation === true
      ? {
          calculation_verified: update(
            "pass",
            `Deterministic repository validation verified ${evidence.validation.pythonUnittestPassed}/${evidence.validation.pythonUnittestTotal} tests with zero failures for ${buildId}.`,
            "Automatic QA verified the exact repository commit/tree, exact required-file hashes, hash-bound canonical validation evidence, and every profile-required validation assertion. Completion timer hours remain governed separately by the transactional completion workflow.",
            {
              ...commonEvidence,
              calculation_source: "profile_validation_evidence",
              python_unittest_total: evidence.validation.pythonUnittestTotal,
              python_unittest_passed: evidence.validation.pythonUnittestPassed,
              python_unittest_failed: evidence.validation.pythonUnittestFailed,
              profile_required_validation_fields:
                profile.validationEvidence.requiredTrueFields,
            },
          ),
        }
      : {};

  return {
    ...calculationUpdate,
    route_or_function_exists: update(
      "pass",
      `The governed callable contract ${callablePath} exists at the exact committed external-repository identity for ${buildId}.`,
      "Automatic QA verified repository HEAD/tree, the exact callable-file SHA-256, and all required callable-contract tokens without executing a write.",
      {
        ...commonEvidence,
        callable_contract_file: callablePath,
        required_tokens: profile.callableContract.requiredTokens,
        callable_contract_verified: evidence.callableContractVerified,
      },
    ),
    ui_shows_expected_new_fields: update(
      "not_applicable",
      `${buildId} contains no user-interface field scope.`,
      "Repository-only automatic QA does not fabricate UI evidence when the governed changed-file contract contains no UI requirement.",
      {
        ...commonEvidence,
        applicability: "no_ui_scope",
      },
    ),
    database_read_verified: update(
      "not_applicable",
      `${buildId} has no product database to read.`,
      "The external repository is explicitly governed as product_database=none; Athena Supabase is control-plane governance only.",
      {
        ...commonEvidence,
        applicability: "repository_only_no_product_database",
      },
    ),
    database_write_verified: update(
      "not_applicable",
      `${buildId} performs no product-database write.`,
      "Automatic QA does not fabricate database-write evidence for repository-only projects.",
      {
        ...commonEvidence,
        applicability: "repository_only_no_product_database",
      },
    ),
    saved_row_verified: update(
      "not_applicable",
      `No product-database saved row exists in the ${buildId} scope.`,
      "Repository persistence is verified through the exact Git commit/tree and required file hashes instead of a database row.",
      {
        ...commonEvidence,
        applicability: "repository_only_git_persistence",
      },
    ),
    rls_policy_reviewed: update(
      "not_applicable",
      `No product-database RLS or policy change exists in ${buildId}.`,
      "The governed external-repository implementation has no product-database security scope; Athena's control-plane database is not modified by the product feature.",
      {
        ...commonEvidence,
        applicability: "repository_only_no_database_security_scope",
      },
    ),
    terminal_build_clean: update(
      "pass",
      `Governed repository validation verified ${evidence.validation.pythonUnittestPassed}/${evidence.validation.pythonUnittestTotal} Python tests with zero failures for ${buildId}.`,
      "Automatic QA uses a hash-bound canonical validation-evidence file plus exact committed source/test hashes instead of workstation-only success claims.",
      {
        ...commonEvidence,
        validation: evidence.validation,
        profile_required_validation_fields:
          profile.validationEvidence.requiredTrueFields,
      },
    ),
    core_pages_regression_checked: update(
      "not_applicable",
      `${buildId} does not modify Athena OS application routes or core pages.`,
      `The exact governed changed-file set contains ${packet.files_changed.length} external-repository paths and no Athena OS route scope.`,
      {
        ...commonEvidence,
        applicability: "external_repository_no_athena_route_scope",
        files_changed: packet.files_changed,
      },
    ),
    no_hardcoded_planning_values: update(
      "pass",
      `The exact ${buildId} changed-file set is external to Athena OS planning storage and cannot contain an Athena project-module planning-table mutation.`,
      `Automatic QA verified the exact external repository commit and all ${packet.files_changed.length} governed changed paths before overriding the generic Athena-source planning check.`,
      {
        ...commonEvidence,
        files_changed: packet.files_changed,
        athena_planning_repository_modified: false,
      },
    ),
  };
}
