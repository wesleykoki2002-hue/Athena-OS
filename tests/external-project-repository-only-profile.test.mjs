import assert from "node:assert/strict";
import test from "node:test";

import {
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0009_REPOSITORY_ONLY_PROFILE,
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
    HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE,
    HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE,
    HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE,
    HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE,
    HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE,
    HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE,
    HANNA_MKT_0009_REPOSITORY_ONLY_PROFILE,
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

test("selects the exact governed HANNA-MKT-0003 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE,
  );
});

test("preserves the exact governed HANNA-MKT-0003 identities", () => {
  const profile = HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE;
  assert.equal(
    profile.target.repositoryHead,
    "986d329aa3df340ce2fbdb98afc80ce1f251d81c",
  );
  assert.equal(
    profile.target.repositoryTree,
    "a3fe63e4d0a03f3a83448e94fde1c8d7c61f0058",
  );
  assert.equal(profile.expectedChangedFiles.length, 6);
  assert.equal(profile.requiredFiles.length, 6);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 88);
  assert.equal(profile.validationEvidence.resolveCalculationFromValidation, true);
  assert.equal(profile.callableContract.relativePath, "scripts/creativectl.py");
});

test("selects the exact governed HANNA-MKT-0004 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE,
  );
});

test("preserves the exact governed HANNA-MKT-0004 identities", () => {
  const profile = HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE;
  assert.equal(
    profile.target.repositoryHead,
    "aa0b2a6409500fb11c85e4798b7bfea038080552",
  );
  assert.equal(
    profile.target.repositoryTree,
    "bd52c2eb547a355fe87fbd406124bde83b1d77c8",
  );
  assert.deepEqual([...profile.expectedChangedFiles], [
    "schemas/product-asset-history.schema.json",
    "scripts/assetctl.py",
    "tests/test_assetctl.py",
  ]);
  assert.equal(profile.requiredFiles.length, 3);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 102);
  assert.equal(profile.validationEvidence.resolveCalculationFromValidation, true);
  assert.equal(profile.callableContract.relativePath, "scripts/assetctl.py");
});

test("selects the exact governed HANNA-MKT-0005 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE,
  );
});

test("preserves the exact governed HANNA-MKT-0005 identities", () => {
  const profile = HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE;
  assert.equal(
    profile.target.repositoryHead,
    "84101da235923d86b72047bdaa7f5f0b9655568c",
  );
  assert.equal(
    profile.target.repositoryTree,
    "4af98551588bca90c2e0c9833badc18130e2d59b",
  );
  assert.deepEqual([...profile.expectedChangedFiles], [
    "schemas/creative-brief.schema.json",
    "schemas/marketing-calendar-task.schema.json",
    "scripts/briefctl.py",
    "tests/test_briefctl.py",
  ]);
  assert.equal(profile.requiredFiles.length, 4);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 122);
  assert.equal(profile.validationEvidence.resolveCalculationFromValidation, true);
  assert.equal(profile.callableContract.relativePath, "scripts/briefctl.py");
});
test("selects the exact governed HANNA-MKT-0006 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE,
  );
});

test("preserves the exact governed HANNA-MKT-0006 identities", () => {
  const profile = HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE;
  assert.equal(
    profile.target.repositoryHead,
    "693eaad47793e3ca5717f891158464eda322ca77",
  );
  assert.equal(
    profile.target.repositoryTree,
    "aa6fc586640900dd0c5b7810a6a2decfc157124b",
  );
  assert.deepEqual([...profile.expectedChangedFiles], [
    "requirements.txt",
    "schemas/creative-review-draft.schema.json",
    "scripts/draftctl.py",
    "tests/test_draftctl.py",
  ]);
  assert.equal(profile.requiredFiles.length, 4);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 146);
  assert.equal(
    profile.validationEvidence.resolveCalculationFromValidation,
    true,
  );
  assert.equal(profile.callableContract.relativePath, "scripts/draftctl.py");
});
test("selects the exact governed HANNA-MKT-0007 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE,
  );
});

test("preserves the exact governed HANNA-MKT-0007 identities", () => {
  const profile = HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE;
  assert.equal(profile.target.repositoryHead, "938cd2bae20ef706f70ad15e5e8ce89a97d43743");
  assert.equal(profile.target.repositoryTree, "76f984698be9730bc0d8432dcd1a5fd1d1877749");
  assert.deepEqual([...profile.expectedChangedFiles], [
    "schemas/marketing-calendar-writeback-intent.schema.json",
    "schemas/marketing-calendar-writeback.schema.json",
    "scripts/writebackctl.py",
    "tests/test_writebackctl.py",
  ]);
  assert.equal(profile.requiredFiles.length, 4);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 173);
  assert.equal(profile.validationEvidence.resolveCalculationFromValidation, true);
  assert.equal(profile.callableContract.relativePath, "scripts/writebackctl.py");
});
test("selects the exact governed HANNA-MKT-0008 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE,
  );
});

test("preserves the exact governed HANNA-MKT-0008 identities", () => {
  const profile = HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE;
  assert.equal(profile.target.repositoryHead, "fb062179e432ad08648011dafc13cc628f21f68f");
  assert.equal(profile.target.repositoryTree, "6fba368faacc6e916e0d9e25685ea72ec27c924a");
  assert.deepEqual([...profile.expectedChangedFiles], [
    "schemas/marketing-review-approval-evidence.schema.json",
    "schemas/marketing-review-approval-intent.schema.json",
    "schemas/marketing-review-decision.schema.json",
    "scripts/reviewctl.py",
    "tests/test_reviewctl.py",
  ]);
  assert.equal(profile.requiredFiles.length, 5);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 198);
  assert.equal(profile.validationEvidence.resolveCalculationFromValidation, true);
  assert.equal(profile.callableContract.relativePath, "scripts/reviewctl.py");
});
test("selects the exact governed HANNA-MKT-0009 repository-only profile", () => {
  assert.equal(
    selectExternalProjectRepositoryOnlyProfile(
      packet(HANNA_MKT_0009_REPOSITORY_ONLY_PROFILE),
    ),
    HANNA_MKT_0009_REPOSITORY_ONLY_PROFILE,
  );
});

test("preserves the exact governed HANNA-MKT-0009 identities", () => {
  const profile = HANNA_MKT_0009_REPOSITORY_ONLY_PROFILE;
  assert.equal(profile.target.repositoryHead, "0eba50ba77e5c98b0baa901507f0f0a4b1dd9a69");
  assert.equal(profile.target.repositoryTree, "8be192be3ead4bbedf5b03a285f8106b0dfbe363");
  assert.deepEqual([...profile.expectedChangedFiles], [
    "schemas/creative-render-authorization.schema.json",
    "schemas/final-campaign-package.schema.json",
    "scripts/render_carousel.py",
    "scripts/renderctl.py",
    "tests/test_renderctl.py",
  ]);
  assert.equal(profile.requiredFiles.length, 5);
  assert.equal(profile.validationEvidence.expectedUnitTestCount, 215);
  assert.equal(profile.validationEvidence.resolveCalculationFromValidation, true);
  assert.equal(profile.callableContract.relativePath, "scripts/renderctl.py");
});
