import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  verifyExternalProjectRepositoryOnlyEvidence,
} from "../src/lib/qa/external-project-repository-only-evidence-core.ts";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
  }).trim();
}

function buildFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "athena-repo-only-"));
  const repo = path.join(root, "external");
  const athenaRoot = path.join(root, "athena");
  mkdirSync(path.join(repo, "scripts"), { recursive: true });
  mkdirSync(path.join(athenaRoot, "evidence", "external-projects"), { recursive: true });

  const toolBytes = Buffer.from(
    "# fixture\ncommands = ['validate', 'check-approval', 'approve']\n",
    "utf8",
  );
  writeFileSync(path.join(repo, "scripts", "tool.py"), toolBytes);

  execFileSync("git", ["init", "-b", "fixture-branch", repo]);
  git(repo, ["config", "user.email", "fixture@example.test"]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["remote", "add", "origin", "https://example.test/external.git"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "fixture"]);

  const head = git(repo, ["rev-parse", "HEAD"]);
  const tree = git(repo, ["rev-parse", "HEAD^{tree}"]);
  const requiredFileSha = sha256(toolBytes);

  const evidenceObject = {
    evidence_version: "fixture-repository-only-v1",
    source: {
      method: "fixture",
      build_id: "FIXTURE-1",
      project_key: "fixture-project",
      module_key: "fixture-module",
      build_session_title: "Fixture build",
    },
    repository: {
      remote: "https://example.test/external.git",
      branch: "fixture-branch",
      commit: head,
      tree,
      remote_commit_verified: true,
      repository_clean: true,
      committed_files: ["scripts/tool.py"],
    },
    files: [
      {
        path: "scripts/tool.py",
        sha256: requiredFileSha,
      },
    ],
    validation: {
      python_unittest_total: 1,
      python_unittest_passed: 1,
      python_unittest_failed: 0,
      canonical_draft_2020_12_schema_verified: true,
      cli_validation_passed: true,
      approval_checks_blocked_as_expected: true,
      blocked_approve_exited_nonzero: true,
      campaign_sha_preserved: true,
      ledger_sha_preserved: true,
      deterministic_preflight_verified: true,
    },
    assertions: {
      product_database: "none",
      database_evidence_required: false,
      repository_write_performed_by_automatic_qa: false,
      database_write_performed_by_automatic_qa: false,
      manual_qa_pass_used: false,
      secret_values_recorded: false,
    },
  };

  const evidenceBytes = Buffer.from(
    `${JSON.stringify(evidenceObject, null, 2)}\n`,
    "utf8",
  );
  const relativeEvidence = "evidence/external-projects/fixture.json";
  writeFileSync(path.join(athenaRoot, ...relativeEvidence.split("/")), evidenceBytes);

  const profile = {
    profileKey: "fixture-repository-only",
    packetIdentity: {
      project_key: "fixture-project",
      module_key: "fixture-module",
      build_session_title: "Fixture build",
    },
    target: {
      repositoryRemote: "https://example.test/external.git",
      repositoryBranch: "fixture-branch",
      repositoryHead: head,
      repositoryTree: tree,
      repositoryPathEnvironment: "FIXTURE_EXTERNAL_REPO",
      repositoryPathFallbacks: [],
    },
    expectedChangedFiles: ["scripts/tool.py"],
    requiredFiles: [
      {
        relativePath: "scripts/tool.py",
        sha256: requiredFileSha,
      },
    ],
    validationEvidence: {
      relativePath: relativeEvidence,
      sha256: sha256(evidenceBytes),
      evidenceVersion: "fixture-repository-only-v1",
      buildId: "FIXTURE-1",
      expectedUnitTestCount: 1,
    },
    callableContract: {
      relativePath: "scripts/tool.py",
      requiredTokens: ["validate", "check-approval", "approve"],
    },
  };

  return { repo, athenaRoot, profile };
}

test("verifies a clean repository-only project end to end", async () => {
  const fixture = buildFixture();
  const result = await verifyExternalProjectRepositoryOnlyEvidence(
    fixture.profile,
    fixture.athenaRoot,
    { FIXTURE_EXTERNAL_REPO: fixture.repo },
  );

  assert.equal(result.repositoryHead, fixture.profile.target.repositoryHead);
  assert.equal(result.repositoryTree, fixture.profile.target.repositoryTree);
  assert.equal(result.repositoryStatusClean, true);
  assert.equal(result.validation.pythonUnittestPassed, 1);
  assert.equal(result.callableContractVerified, true);
});

test("fails closed when the external repository becomes dirty", async () => {
  const fixture = buildFixture();
  appendFileSync(path.join(fixture.repo, "scripts", "tool.py"), "# dirty\n");

  await assert.rejects(
    () =>
      verifyExternalProjectRepositoryOnlyEvidence(
        fixture.profile,
        fixture.athenaRoot,
        { FIXTURE_EXTERNAL_REPO: fixture.repo },
      ),
    /not clean/,
  );
});
