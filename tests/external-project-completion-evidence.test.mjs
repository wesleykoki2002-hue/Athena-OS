import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
} from "../src/lib/qa/external-project-completion-profile.ts";

import {
  buildExternalProjectCompletionAutomaticQaUpdates,
} from "../src/lib/qa/external-project-completion-evidence-core.ts";

const profile =
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE;

const wrapperSource =
  readFileSync(
    new URL(
      "../src/lib/qa/external-project-completion-evidence.ts",
      import.meta.url,
    ),
    "utf8",
  );

const zeroSecurityTokenCounts = {
  "enable row level security": 0,
  "create policy": 0,
  "alter policy": 0,
  "drop policy": 0,
  "grant ": 0,
  "revoke ": 0,
  "security definer": 0,
  "set search_path": 0,
};

function createRepositoryEvidence() {
  return {
    repositoryPath:
      "C:\\supabase\\beauty-os",

    repositoryRemote:
      profile.target.repositoryRemote,

    repositoryBranch:
      profile.target.repositoryBranch,

    repositoryHead:
      profile.target.repositoryHead,

    repositoryTree:
      "1111111111111111111111111111111111111111",

    linkedSupabaseProjectRef:
      profile.target.supabaseProjectRef,

    trackedDiffEmpty: true,

    stagedDiffEmpty: true,

    migrations:
      profile.migrations.map(
        (migration) => ({
          relativePath:
            migration.relativePath,

          sha256:
            migration.sha256,

          securityTokenCounts: {
            ...zeroSecurityTokenCounts,
          },
        }),
      ),

    repositoryEvidenceSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  };
}

function createDatabaseEvidence() {
  return {
    metrics: {
      ...profile.expectedMetrics,
    },

    mappingIds:
      profile.mappings.map(
        (mapping) =>
          mapping.productIngredientId,
      ),

    holdIds:
      profile.holds.map(
        (hold) =>
          hold.productIngredientId,
      ),

    databaseEvidenceSha256:
      "3333333333333333333333333333333333333333333333333333333333333333",

    readOnlyVerified: true,
  };
}

function createInput() {
  return {
    profile,

    repository:
      createRepositoryEvidence(),

    database:
      createDatabaseEvidence(),

    security: {
      rlsEnabledTableCount: 14,
      policyCount: 0,
      finalMigrationHistoryRows: 1,
      evidenceRelativePath:
        profile.liveSecurityEvidence.relativePath,
      evidenceSha256:
        profile.liveSecurityEvidence.sha256,
    },
  };
}

test(
  "stores the exact governed live security expectations",
  () => {
    assert.deepEqual(
      profile.expectedSecurity,
      {
        rlsEnabledTableCount: 14,
        policyCount: 0,
        migrationSecurityTokenCount: 0,
      },
    );
  },
);

test(
  "builds the exact six governed QA updates",
  () => {
    const updates =
      buildExternalProjectCompletionAutomaticQaUpdates(
        createInput(),
      );

    assert.deepEqual(
      Object.keys(updates).sort(),
      [
        "database_read_verified",
        "database_write_verified",
        "rls_policy_reviewed",
        "route_or_function_exists",
        "saved_row_verified",
        "ui_shows_expected_new_fields",
      ],
    );

    assert.equal(
      updates
        .route_or_function_exists
        .status,
      "not_applicable",
    );

    assert.equal(
      updates
        .ui_shows_expected_new_fields
        .status,
      "not_applicable",
    );

    assert.equal(
      updates
        .database_read_verified
        .status,
      "pass",
    );

    assert.equal(
      updates
        .database_write_verified
        .status,
      "pass",
    );

    assert.equal(
      updates
        .saved_row_verified
        .status,
      "pass",
    );

    assert.equal(
      updates
        .rls_policy_reviewed
        .status,
      "pass",
    );
  },
);

test(
  "uses the existing Athena automatic-QA evidence contract",
  () => {
    const updates =
      buildExternalProjectCompletionAutomaticQaUpdates(
        createInput(),
      );

    for (
      const update of
      Object.values(updates)
    ) {
      assert.equal(
        update.evidence.automatic_qa,
        true,
      );

      assert.equal(
        update.evidence.evidence_version,
        "0083-automatic-qa-evidence-v1",
      );

      assert.equal(
        update.evidence
          .external_project_evidence_version,
        "external-project-completion-v1",
      );

      assert.equal(
        update.evidence
          .completion_packet_id,
        profile.packetIdentity.id,
      );
    }
  },
);

test(
  "fails when repository identity does not match",
  () => {
    const input = createInput();

    input.repository.repositoryHead =
      "0000000000000000000000000000000000000000";

    assert.throws(
      () =>
        buildExternalProjectCompletionAutomaticQaUpdates(
          input,
        ),
      /Repository HEAD mismatch/,
    );
  },
);

test(
  "fails when a governed migration hash does not match",
  () => {
    const input = createInput();

    input.repository
      .migrations[0]
      .sha256 =
        "0000000000000000000000000000000000000000000000000000000000000000";

    assert.throws(
      () =>
        buildExternalProjectCompletionAutomaticQaUpdates(
          input,
        ),
      /Migration SHA-256/,
    );
  },
);

test(
  "fails when a migration contains an unapproved security change",
  () => {
    const input = createInput();

    input.repository
      .migrations[0]
      .securityTokenCounts[
        "create policy"
      ] = 1;

    assert.throws(
      () =>
        buildExternalProjectCompletionAutomaticQaUpdates(
          input,
        ),
      /Migration security-token total/,
    );
  },
);

test(
  "fails when a database metric does not match",
  () => {
    const input = createInput();

    input.database.metrics
      .matchedOccurrences = 163;

    assert.throws(
      () =>
        buildExternalProjectCompletionAutomaticQaUpdates(
          input,
        ),
      /Database metric matchedOccurrences/,
    );
  },
);

test(
  "fails when saved-row identities do not match",
  () => {
    const input = createInput();

    input.database.mappingIds =
      input.database.mappingIds.slice(1);

    assert.throws(
      () =>
        buildExternalProjectCompletionAutomaticQaUpdates(
          input,
        ),
      /Resolved product-ingredient rows/,
    );
  },
);

test(
  "fails when live RLS evidence does not match",
  () => {
    const input = createInput();

    input.security
      .rlsEnabledTableCount = 6;

    assert.throws(
      () =>
        buildExternalProjectCompletionAutomaticQaUpdates(
          input,
        ),
      /RLS-enabled table count mismatch/,
    );
  },
);

test(
  "fails when the live security evidence hash does not match",
  () => {
    const input = createInput();

    input.security.evidenceSha256 =
      "0000000000000000000000000000000000000000000000000000000000000000";

    assert.throws(
      () =>
        buildExternalProjectCompletionAutomaticQaUpdates(
          input,
        ),
      /Live security evidence SHA-256/,
    );
  },
);

test(
  "does not mutate the supplied profile or evidence",
  () => {
    const input = createInput();

    const before =
      structuredClone(input);

    buildExternalProjectCompletionAutomaticQaUpdates(
      input,
    );

    assert.deepEqual(
      input,
      before,
    );
  },
);

test(
  "keeps the production adapter behind a server-only wrapper",
  () => {
    assert.match(
      wrapperSource,
      /^import "server-only";\n/,
    );

    assert.match(
      wrapperSource,
      /external-project-completion-evidence-core/,
    );

    assert.equal(
      wrapperSource.includes(
        "NEXT_PUBLIC_",
      ),
      false,
    );
  },
);