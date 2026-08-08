import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExternalProjectRepositoryOnlyAutomaticQaUpdates,
} from "../src/lib/qa/external-project-repository-only-evidence-core.ts";
import {
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
} from "../src/lib/qa/external-project-repository-only-profile.ts";

const profile = HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE;

function evidence() {
  return {
    repositoryPath: "C:\\supabase\\hanna-social-operator",
    repositoryRemote: profile.target.repositoryRemote,
    repositoryBranch: profile.target.repositoryBranch,
    repositoryHead: profile.target.repositoryHead,
    repositoryTree: profile.target.repositoryTree,
    repositoryStatusClean: true,
    trackedIndexSha256:
      "1".repeat(64),
    requiredFiles: profile.requiredFiles.map((file) => ({ ...file })),
    validationEvidenceRelativePath:
      profile.validationEvidence.relativePath,
    validationEvidenceSha256:
      profile.validationEvidence.sha256,
    validation: {
      pythonUnittestTotal: 32,
      pythonUnittestPassed: 32,
      pythonUnittestFailed: 0,
      canonicalDraft202012SchemaVerified: true,
      cliValidationPassed: true,
      approvalChecksBlockedAsExpected: true,
      blockedApproveExitedNonzero: true,
      campaignShaPreserved: true,
      ledgerShaPreserved: true,
      deterministicPreflightVerified: true,
    },
    callableContractVerified: true,
    evidenceSha256:
      "2".repeat(64),
  };
}

function packet(overrides = {}) {
  return {
    id: "hanna-packet-fixture",
    project_key: profile.packetIdentity.project_key,
    module_key: profile.packetIdentity.module_key,
    build_session_title: profile.packetIdentity.build_session_title,
    files_changed: [...profile.expectedChangedFiles],
    ...overrides,
  };
}

test("builds repository-only automatic QA without fabricating database evidence", () => {
  const updates =
    buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
      profile,
      packet: packet(),
      evidence: evidence(),
    });

  assert.equal(updates.route_or_function_exists.status, "pass");
  assert.equal(updates.terminal_build_clean.status, "pass");
  assert.equal(updates.no_hardcoded_planning_values.status, "pass");
  assert.equal(updates.ui_shows_expected_new_fields.status, "not_applicable");
  assert.equal(updates.database_read_verified.status, "not_applicable");
  assert.equal(updates.database_write_verified.status, "not_applicable");
  assert.equal(updates.saved_row_verified.status, "not_applicable");
  assert.equal(updates.rls_policy_reviewed.status, "not_applicable");
  assert.equal(updates.core_pages_regression_checked.status, "not_applicable");

  for (const update of Object.values(updates)) {
    assert.equal(update.evidence.automatic_qa, true);
    assert.equal(
      update.evidence.external_project_evidence_version,
      "external-project-repository-only-v1",
    );
    assert.equal(update.evidence.product_database, "none");
  }
});

test("fails closed when completion packet changed files do not match", () => {
  assert.throws(
    () =>
      buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
        profile,
        packet: packet({ files_changed: ["scripts/campaignctl.py"] }),
        evidence: evidence(),
      }),
    /files_changed does not match/,
  );
});

test("does not mutate supplied packet or evidence", () => {
  const inputPacket = packet();
  const inputEvidence = evidence();
  const beforePacket = structuredClone(inputPacket);
  const beforeEvidence = structuredClone(inputEvidence);

  buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: inputPacket,
    evidence: inputEvidence,
  });

  assert.deepEqual(inputPacket, beforePacket);
  assert.deepEqual(inputEvidence, beforeEvidence);
});
