import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
  mkdirSync(
    path.join(athenaRoot, "evidence", "external-projects"),
    { recursive: true },
  );

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
    files: [{ path: "scripts/tool.py", sha256: requiredFileSha }],
    validation: {
      python_unittest_total: 1,
      python_unittest_passed: 1,
      python_unittest_failed: 0,
      fixture_required_validation: true,
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
  const evidencePath = path.join(
    athenaRoot,
    ...relativeEvidence.split("/"),
  );
  writeFileSync(evidencePath, evidenceBytes);

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
    requiredFiles: [{ relativePath: "scripts/tool.py", sha256: requiredFileSha }],
    validationEvidence: {
      relativePath: relativeEvidence,
      sha256: sha256(evidenceBytes),
      evidenceVersion: "fixture-repository-only-v1",
      buildId: "FIXTURE-1",
      expectedUnitTestCount: 1,
      requiredTrueFields: ["fixture_required_validation"],
    },
    callableContract: {
      relativePath: "scripts/tool.py",
      requiredTokens: ["validate", "check-approval", "approve"],
    },
  };

  return {
    repo,
    athenaRoot,
    profile,
    evidenceObject,
    evidencePath,
  };
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

test("fails closed when a required committed-file hash is wrong", async () => {
  const fixture = buildFixture();
  const badProfile = structuredClone(fixture.profile);
  badProfile.requiredFiles[0].sha256 = "0".repeat(64);

  await assert.rejects(
    () =>
      verifyExternalProjectRepositoryOnlyEvidence(
        badProfile,
        fixture.athenaRoot,
        { FIXTURE_EXTERNAL_REPO: fixture.repo },
      ),
    /committed file SHA-256/,
  );
});

test("fails closed when canonical validation evidence is missing", async () => {
  const fixture = buildFixture();
  unlinkSync(fixture.evidencePath);

  await assert.rejects(
    () =>
      verifyExternalProjectRepositoryOnlyEvidence(
        fixture.profile,
        fixture.athenaRoot,
        { FIXTURE_EXTERNAL_REPO: fixture.repo },
      ),
    /ENOENT|no such file/i,
  );
});

test("fails closed when a profile-required validation assertion is false", async () => {
  const fixture = buildFixture();
  const changed = structuredClone(fixture.evidenceObject);
  changed.validation.fixture_required_validation = false;
  const changedBytes = Buffer.from(
    `${JSON.stringify(changed, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(fixture.evidencePath, changedBytes);

  const changedProfile = structuredClone(fixture.profile);
  changedProfile.validationEvidence.sha256 = sha256(changedBytes);

  await assert.rejects(
    () =>
      verifyExternalProjectRepositoryOnlyEvidence(
        changedProfile,
        fixture.athenaRoot,
        { FIXTURE_EXTERNAL_REPO: fixture.repo },
      ),
    /Required validation fixture_required_validation/,
  );
});
