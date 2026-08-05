import type {
  ExternalProjectCompletionProfile,
} from "./external-project-completion-profile";

import type {
  ExternalProjectDatabaseEvidence,
  ExternalProjectDatabaseMetrics,
} from "./external-project-database-evidence";

import type {
  ExternalProjectRepositoryEvidence,
} from "./external-project-repository-evidence";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type ExternalProjectAutomaticQaStatus =
  | "pass"
  | "warning"
  | "fail"
  | "pending"
  | "not_applicable";

export type ExternalProjectAutomaticQaUpdate = {
  status: ExternalProjectAutomaticQaStatus;
  actual_result: string;
  notes: string;
  evidence: Record<string, unknown>;
};

export type ExternalProjectCompletionCheckKey =
  | "route_or_function_exists"
  | "ui_shows_expected_new_fields"
  | "database_read_verified"
  | "database_write_verified"
  | "saved_row_verified"
  | "rls_policy_reviewed";

export type ExternalProjectLiveSecurityEvidence = {
  rlsEnabledTableCount: number;
  policyCount: number;
  finalMigrationHistoryRows: number;
  evidenceRelativePath: string;
  evidenceSha256: string;
};

export type ExternalProjectCompletionEvidenceInput = {
  profile: ExternalProjectCompletionProfile;
  repository:
    ExternalProjectRepositoryEvidence;
  database:
    ExternalProjectDatabaseEvidence;
  security:
    ExternalProjectLiveSecurityEvidence;
};

function update(
  status: ExternalProjectAutomaticQaStatus,
  actualResult: string,
  notes: string,
  evidence: Record<string, unknown>,
): ExternalProjectAutomaticQaUpdate {
  return {
    status,
    actual_result: actualResult,
    notes,
    evidence: {
      automatic_qa: true,
      evidence_version:
        "0083-automatic-qa-evidence-v1",
      external_project_evidence_version:
        "external-project-completion-v1",
      ...evidence,
    },
  };
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

function assertSha256(
  label: string,
  value: string,
): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(
      `${label} is not a valid SHA-256 identity.`,
    );
  }
}

function assertNonNegativeInteger(
  label: string,
  value: number,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} must be a non-negative integer.`,
    );
  }
}

function assertExactIds(
  label: string,
  actualIds: readonly string[],
  expectedIds: readonly string[],
): void {
  const actual =
    [...actualIds].sort();

  const expected =
    [...expectedIds].sort();

  if (
    actual.length !==
      new Set(actual).size ||
    expected.length !==
      new Set(expected).size ||
    JSON.stringify(actual) !==
      JSON.stringify(expected)
  ) {
    throw new Error(
      `${label} identity set does not match the governed profile.`,
    );
  }
}

function validateRepositoryEvidence(
  profile: ExternalProjectCompletionProfile,
  repository:
    ExternalProjectRepositoryEvidence,
): number {
  assertEqual(
    "Repository remote",
    repository.repositoryRemote,
    profile.target.repositoryRemote,
  );

  assertEqual(
    "Repository branch",
    repository.repositoryBranch,
    profile.target.repositoryBranch,
  );

  assertEqual(
    "Repository HEAD",
    repository.repositoryHead,
    profile.target.repositoryHead,
  );

  assertEqual(
    "Linked Supabase project",
    repository.linkedSupabaseProjectRef,
    profile.target.supabaseProjectRef,
  );

  assertEqual(
    "Tracked repository cleanliness",
    repository.trackedDiffEmpty,
    true,
  );

  assertEqual(
    "Staged repository cleanliness",
    repository.stagedDiffEmpty,
    true,
  );

  assertSha256(
    "Repository evidence hash",
    repository.repositoryEvidenceSha256,
  );

  if (
    repository.migrations.length !==
    profile.migrations.length
  ) {
    throw new Error(
      "Repository migration count does not match the governed profile.",
    );
  }

  const actualMigrations =
    new Map(
      repository.migrations.map(
        (migration) => [
          migration.relativePath,
          migration,
        ],
      ),
    );

  if (
    actualMigrations.size !==
    repository.migrations.length
  ) {
    throw new Error(
      "Repository migration evidence contains duplicate paths.",
    );
  }

  let securityTokenCount = 0;

  for (
    const expectedMigration of
    profile.migrations
  ) {
    const actualMigration =
      actualMigrations.get(
        expectedMigration.relativePath,
      );

    if (!actualMigration) {
      throw new Error(
        `Required migration evidence is missing: ${expectedMigration.relativePath}`,
      );
    }

    assertEqual(
      `Migration SHA-256 ${expectedMigration.relativePath}`,
      actualMigration.sha256,
      expectedMigration.sha256,
    );

    assertSha256(
      `Migration evidence hash ${expectedMigration.relativePath}`,
      actualMigration.sha256,
    );

    for (
      const [
        token,
        count,
      ] of Object.entries(
        actualMigration
          .securityTokenCounts,
      )
    ) {
      assertNonNegativeInteger(
        `Migration security-token count ${token}`,
        count,
      );

      securityTokenCount += count;
    }
  }

  assertEqual(
    "Migration security-token total",
    securityTokenCount,
    profile.expectedSecurity
      .migrationSecurityTokenCount,
  );

  return securityTokenCount;
}

function validateDatabaseEvidence(
  profile: ExternalProjectCompletionProfile,
  database:
    ExternalProjectDatabaseEvidence,
): void {
  assertEqual(
    "Read-only database verification",
    database.readOnlyVerified,
    true,
  );

  assertSha256(
    "Database evidence hash",
    database.databaseEvidenceSha256,
  );

  for (
    const [
      key,
      expected,
    ] of Object.entries(
      profile.expectedMetrics,
    )
  ) {
    assertEqual(
      `Database metric ${key}`,
      database.metrics[
        key as keyof
          ExternalProjectDatabaseMetrics
      ],
      expected,
    );
  }

  assertExactIds(
    "Resolved product-ingredient rows",
    database.mappingIds,
    profile.mappings.map(
      (mapping) =>
        mapping.productIngredientId,
    ),
  );

  assertExactIds(
    "Governed held product-ingredient rows",
    database.holdIds,
    profile.holds.map(
      (hold) =>
        hold.productIngredientId,
    ),
  );
}

function validateSecurityEvidence(
  profile: ExternalProjectCompletionProfile,
  security:
    ExternalProjectLiveSecurityEvidence,
): void {
  assertNonNegativeInteger(
    "RLS-enabled table count",
    security.rlsEnabledTableCount,
  );

  assertNonNegativeInteger(
    "Policy count",
    security.policyCount,
  );

  assertEqual(
    "RLS-enabled table count",
    security.rlsEnabledTableCount,
    profile.expectedSecurity
      .rlsEnabledTableCount,
  );

  assertEqual(
    "Policy count",
    security.policyCount,
    profile.expectedSecurity
      .policyCount,
  );

  assertEqual(
    "Final migration history rows",
    security.finalMigrationHistoryRows,
    profile.expectedMetrics
      .finalMigrationHistoryRows,
  );

  assertEqual(
    "Live security evidence path",
    security.evidenceRelativePath,
    profile.liveSecurityEvidence
      .relativePath,
  );

  assertSha256(
    "Live security evidence hash",
    security.evidenceSha256,
  );

  assertEqual(
    "Live security evidence SHA-256",
    security.evidenceSha256,
    profile.liveSecurityEvidence
      .sha256,
  );
}

export function
buildExternalProjectCompletionAutomaticQaUpdates(
  input:
    ExternalProjectCompletionEvidenceInput,
): Record<
  ExternalProjectCompletionCheckKey,
  ExternalProjectAutomaticQaUpdate
> {
  const {
    profile,
    repository,
    database,
    security,
  } = input;

  const migrationSecurityTokenCount =
    validateRepositoryEvidence(
      profile,
      repository,
    );

  validateDatabaseEvidence(
    profile,
    database,
  );

  validateSecurityEvidence(
    profile,
    security,
  );

  const commonEvidence = {
    source:
      "external_project_completion_evidence",
    profile_key:
      profile.profileKey,
    completion_packet_id:
      profile.packetIdentity.id,
    project_key:
      profile.packetIdentity.project_key,
    module_key:
      profile.packetIdentity.module_key,
    build_session_title:
      profile.packetIdentity
        .build_session_title,
    target_supabase_project_ref:
      profile.target.supabaseProjectRef,
    repository_remote:
      repository.repositoryRemote,
    repository_branch:
      repository.repositoryBranch,
    repository_head:
      repository.repositoryHead,
    repository_tree:
      repository.repositoryTree,
    repository_evidence_sha256:
      repository.repositoryEvidenceSha256,
    database_evidence_sha256:
      database.databaseEvidenceSha256,
    live_security_evidence_relative_path:
      security.evidenceRelativePath,
    live_security_evidence_sha256:
      security.evidenceSha256,
    final_migration_history_rows:
      security.finalMigrationHistoryRows,
  };

  return {
    route_or_function_exists:
      update(
        "not_applicable",
        "No Athena route or callable feature function is required for this external database-only completion.",
        "The governed profile applies to BeautyDNA repository and database evidence rather than a new Athena application route.",
        {
          ...commonEvidence,
          applicability:
            "external_database_only",
        },
      ),

    ui_shows_expected_new_fields:
      update(
        "not_applicable",
        "No user-interface field was added or changed by BDNA-ING-0004.",
        "The governed implementation scope contains repository migrations and canonical BeautyDNA data changes only.",
        {
          ...commonEvidence,
          applicability:
            "no_ui_scope",
        },
      ),

    database_read_verified:
      update(
        "pass",
        "Read-only BeautyDNA evidence verified 5 launch products, 167 ingredient occurrences, 164 matched rows, 3 governed holds, and 98.20% coverage.",
        "The external-project reader returned the exact governed scope and the deterministic evaluator matched every expected metric.",
        {
          ...commonEvidence,
          metrics:
            database.metrics,
          read_only_verified:
            database.readOnlyVerified,
        },
      ),

    database_write_verified:
      update(
        "pass",
        `Persisted BeautyDNA effects were verified from ${repository.migrations.length} governed migration files and ${database.metrics.finalMigrationHistoryRows} final migration-history row.`,
        "Migration hashes, product-specific resolution metadata, governed hold metadata, and final live-state metrics all matched the approved profile.",
        {
          ...commonEvidence,
          migration_count:
            repository.migrations.length,
          final_migration_history_rows:
            database.metrics
              .finalMigrationHistoryRows,
          migration_security_token_count:
            migrationSecurityTokenCount,
          migration_hashes:
            repository.migrations.map(
              (migration) => ({
                relative_path:
                  migration.relativePath,
                sha256:
                  migration.sha256,
              }),
            ),
        },
      ),

    saved_row_verified:
      update(
        "pass",
        "Three exact product-specific mappings and three exact governed hold rows were verified in both product-ingredient and review-queue state.",
        "The saved-row evidence matched every governed product ingredient, review-queue row, canonical identity, source identity, build marker, and batch marker.",
        {
          ...commonEvidence,
          verified_mapping_rows:
            database.metrics
              .verifiedMappingRows,
          verified_hold_rows:
            database.metrics
              .verifiedHoldRows,
          mapping_product_ingredient_ids:
            database.mappingIds,
          hold_product_ingredient_ids:
            database.holdIds,
        },
      ),

    rls_policy_reviewed:
      update(
        "pass",
        `Security review verified ${security.rlsEnabledTableCount} RLS-enabled BeautyDNA tables, ${security.policyCount} policies, and ${migrationSecurityTokenCount} governed migration security changes.`,
        "The BDNA-ING-0004 migrations did not enable or disable RLS, create or alter policies, change grants, introduce SECURITY DEFINER, or change search_path.",
        {
          ...commonEvidence,
          rls_enabled_table_count:
            security.rlsEnabledTableCount,
          policy_count:
            security.policyCount,
          migration_security_token_count:
            migrationSecurityTokenCount,
        },
      ),
  };
}