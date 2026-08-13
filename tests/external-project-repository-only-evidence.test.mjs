import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExternalProjectRepositoryOnlyAutomaticQaUpdates,
} from "../src/lib/qa/external-project-repository-only-evidence-core.ts";
import {
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE,
} from "../src/lib/qa/external-project-repository-only-profile.ts";

function evidence(profile) {
  const count = profile.validationEvidence.expectedUnitTestCount;
  return {
    repositoryPath: "C:\\supabase\\hanna-social-operator",
    repositoryRemote: profile.target.repositoryRemote,
    repositoryBranch: profile.target.repositoryBranch,
    repositoryHead: profile.target.repositoryHead,
    repositoryTree: profile.target.repositoryTree,
    repositoryStatusClean: true,
    trackedIndexSha256: "1".repeat(64),
    requiredFiles: profile.requiredFiles.map((file) => ({ ...file })),
    validationEvidenceRelativePath: profile.validationEvidence.relativePath,
    validationEvidenceSha256: profile.validationEvidence.sha256,
    validation: {
      pythonUnittestTotal: count,
      pythonUnittestPassed: count,
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
    evidenceSha256: "2".repeat(64),
  };
}

function packet(profile, overrides = {}) {
  return {
    id: "hanna-packet-fixture",
    project_key: profile.packetIdentity.project_key,
    module_key: profile.packetIdentity.module_key,
    build_session_title: profile.packetIdentity.build_session_title,
    files_changed: [...profile.expectedChangedFiles],
    ...overrides,
  };
}

function assertRepositoryOnlyApplicability(updates) {
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
}

test("preserves HANNA-MKT-0001 repository-only QA behavior", () => {
  const profile = HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(Object.hasOwn(updates, "calculation_verified"), false);
});

test("builds HANNA-MKT-0002 repository-only QA with deterministic calculation evidence", () => {
  const profile = HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(updates.calculation_verified.status, "pass");
  assert.match(
    updates.route_or_function_exists.actual_result,
    /scripts\/knowledgectl\.py/,
  );
  assert.match(updates.calculation_verified.actual_result, /52\/52/);
  assert.equal(
    updates.calculation_verified.evidence.calculation_source,
    "profile_validation_evidence",
  );
});

test("fails closed when completion packet changed files do not match", () => {
  const profile = HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE;
  assert.throws(
    () =>
      buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
        profile,
        packet: packet(profile, {
          files_changed: ["scripts/knowledgectl.py"],
        }),
        evidence: evidence(profile),
      }),
    /files_changed does not match/,
  );
});

test("does not mutate supplied packet or evidence", () => {
  const profile = HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE;
  const inputPacket = packet(profile);
  const inputEvidence = evidence(profile);
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

test("builds HANNA-MKT-0003 repository-only QA with deterministic calculation evidence", () => {
  const profile = HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(updates.calculation_verified.status, "pass");
  assert.match(
    updates.route_or_function_exists.actual_result,
    /scripts\/creativectl\.py/,
  );
  assert.match(updates.calculation_verified.actual_result, /88\/88/);
  assert.equal(
    updates.calculation_verified.evidence.calculation_source,
    "profile_validation_evidence",
  );
});

test("builds HANNA-MKT-0004 repository-only QA with deterministic calculation evidence", () => {
  const profile = HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(updates.calculation_verified.status, "pass");
  assert.match(
    updates.route_or_function_exists.actual_result,
    /scripts\/assetctl\.py/,
  );
  assert.match(updates.calculation_verified.actual_result, /102\/102/);
  assert.equal(
    updates.calculation_verified.evidence.calculation_source,
    "profile_validation_evidence",
  );
});

test("builds HANNA-MKT-0005 repository-only QA with deterministic calculation evidence", () => {
  const profile = HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(updates.calculation_verified.status, "pass");
  assert.match(
    updates.route_or_function_exists.actual_result,
    /scripts\/briefctl\.py/,
  );
  assert.match(updates.calculation_verified.actual_result, /122\/122/);
  assert.equal(
    updates.calculation_verified.evidence.calculation_source,
    "profile_validation_evidence",
  );
});
test("builds HANNA-MKT-0006 repository-only QA with deterministic calculation evidence", () => {
  const profile = HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(updates.calculation_verified.status, "pass");
  assert.match(
    updates.route_or_function_exists.actual_result,
    /scripts\/draftctl\.py/,
  );
  assert.match(updates.calculation_verified.actual_result, /146\/146/);
  assert.equal(
    updates.calculation_verified.evidence.calculation_source,
    "profile_validation_evidence",
  );
});
test("builds HANNA-MKT-0007 repository-only QA with deterministic calculation evidence", () => {
  const profile = HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(updates.calculation_verified.status, "pass");
  assert.match(
    updates.route_or_function_exists.actual_result,
    /scripts\/writebackctl\.py/,
  );
  assert.match(updates.calculation_verified.actual_result, /173\/173/);
  assert.equal(
    updates.calculation_verified.evidence.calculation_source,
    "profile_validation_evidence",
  );
});
test("builds HANNA-MKT-0008 repository-only QA with deterministic calculation evidence", () => {
  const profile = HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE;
  const updates = buildExternalProjectRepositoryOnlyAutomaticQaUpdates({
    profile,
    packet: packet(profile),
    evidence: evidence(profile),
  });

  assertRepositoryOnlyApplicability(updates);
  assert.equal(updates.calculation_verified.status, "pass");
  assert.match(
    updates.route_or_function_exists.actual_result,
    /scripts\/reviewctl\.py/,
  );
  assert.match(updates.calculation_verified.actual_result, /198\/198/);
  assert.equal(
    updates.calculation_verified.evidence.calculation_source,
    "profile_validation_evidence",
  );
});
