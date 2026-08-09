import assert from "node:assert/strict";
import test from "node:test";

import {
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
  selectExternalProjectRepositoryOnlyProfile,
} from "../src/lib/qa/external-project-repository-only-profile.ts";

function packet(profile, overrides = {}) {
  return {
    id: "future-hanna-completion-packet-id",
    project_key: profile.packetIdentity.project_key,
    module_key: profile.packetIdentity.module_key,
    build_session_title: profile.packetIdentity.build_session_title,
    ...overrides,
  };
}

test("selects the exact governed HANNA-MKT-0001 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  );
});

test("selects the exact governed HANNA-MKT-0002 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
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
        packet(HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE, { [field]: value }),
      ),
      null,
    );
  });
}

test("repository-only profiles do not require a product Supabase identity", () => {
  for (const profile of [
    HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
    HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
  ]) {
    assert.equal(Object.hasOwn(profile.target, "supabaseProjectRef"), false);
    assert.equal(Object.hasOwn(profile.target, "supabaseUrlEnvironment"), false);
    assert.equal(
      Object.hasOwn(profile.target, "supabaseServiceRoleKeyEnvironment"),
      false,
    );
  }
});

test("preserves the exact governed HANNA-MKT-0001 identities and calculation behavior", () => {
  const profile = HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE;
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
    ["scripts/campaignctl.py", "tests/test_campaignctl.py"],
  );
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 32);
  assert.equal(
    Object.hasOwn(profile.validationEvidence, "resolveCalculationFromValidation"),
    false,
  );
});

test("preserves the exact governed HANNA-MKT-0002 identities", () => {
  const profile = HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE;
  assert.equal(
    profile.target.repositoryHead,
    "378ef70c23d20315fc7c2a301d3b8c8370ea693f",
  );
  assert.equal(
    profile.target.repositoryTree,
    "adf8b25c54acc9193b4bbe910336f5c63aeb661c",
  );
  assert.equal(profile.expectedChangedFiles.length, 9);
  assert.equal(profile.requiredFiles.length, 9);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 52);
  assert.equal(profile.validationEvidence.resolveCalculationFromValidation, true);
  assert.equal(profile.callableContract.relativePath, "scripts/knowledgectl.py");
});
