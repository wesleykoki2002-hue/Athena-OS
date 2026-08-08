import assert from "node:assert/strict";
import test from "node:test";

import {
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  selectExternalProjectRepositoryOnlyProfile,
} from "../src/lib/qa/external-project-repository-only-profile.ts";

const profile = HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE;

function packet(overrides = {}) {
  return {
    id: "future-hanna-completion-packet-id",
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0001 Campaign Foundation, Claim Governance, and Approval Preflight",
    ...overrides,
  };
}

test("selects the exact governed HANNA-MKT-0001 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(packet()),
    profile,
  );
});

for (const [field, value] of [
  ["project_key", "other-project"],
  ["module_key", "other-module"],
  ["build_session_title", "other-build"],
]) {
  test(`rejects a repository-only packet with the wrong ${field}`, () => {
    assert.equal(
      selectExternalProjectRepositoryOnlyProfile(
        packet({ [field]: value }),
      ),
      null,
    );
  });
}

test("does not require a product Supabase identity", () => {
  assert.equal(
    Object.hasOwn(profile.target, "supabaseProjectRef"),
    false,
  );
  assert.equal(
    Object.hasOwn(profile.target, "supabaseUrlEnvironment"),
    false,
  );
  assert.equal(
    Object.hasOwn(profile.target, "supabaseServiceRoleKeyEnvironment"),
    false,
  );
});

test("preserves the exact governed Hanna Git and file identities", () => {
  assert.equal(
    profile.target.repositoryHead,
    "b93a2d2d15758c0b212d5a18a320b8995b822c53",
  );
  assert.equal(
    profile.target.repositoryTree,
    "b15699e48bb41c3a9446b50cbf9d5f849c1983f7",
  );
  assert.deepEqual(
    [...profile.expectedChangedFiles],
    [
      "scripts/campaignctl.py",
      "tests/test_campaignctl.py",
    ],
  );
  assert.equal(profile.requiredFiles.length, 4);
  assert.equal(
    profile.validationEvidence.expectedUnitTestCount,
    32,
  );
});
