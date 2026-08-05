import { createHash } from "node:crypto";

import type {
  ExternalProjectCompletionProfile,
} from "./external-project-completion-profile";

type JsonRecord = Record<string, unknown>;

export type ExternalProjectProductRow = {
  id: string;
  approval_status: string | null;
};

export type ExternalProjectProductIngredientRow = {
  id: string;
  product_id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  normalized_ingredient_name: string;
  match_status: string;
  review_status: string;
  metadata: JsonRecord | null;
};

export type ExternalProjectQueueRow = {
  id: string;
  product_id: string;
  ingredient_name: string;
  normalized_ingredient_name: string;
  status: string;
  resolved_ingredient_id: string | null;
  metadata: JsonRecord | null;
};

export type ExternalProjectIntelligenceRow = {
  id: string;
  ingredient_name: string;
  normalized_name: string | null;
  normalized_ingredient_name: string | null;
  review_status: string;
  metadata: JsonRecord | null;
};

export type ExternalProjectAliasRow = {
  id: string;
  normalized_alias_name: string;
  ingredient_id: string;
};

export type ExternalProjectDatabaseSnapshot = {
  products: ExternalProjectProductRow[];
  productIngredients:
    ExternalProjectProductIngredientRow[];
  queueRows: ExternalProjectQueueRow[];
  intelligenceRows:
    ExternalProjectIntelligenceRow[];
  aliasRows: ExternalProjectAliasRow[];
  compatibilityRuleRows: number;
  legacyMatchRows: number;
  finalMigrationHistoryRows: number;
};

export type ExternalProjectDatabaseMetrics = {
  launchProducts: number;
  ingredientOccurrences: number;
  matchedOccurrences: number;
  governedUnmatchedOccurrences: number;
  coveragePercent: number;
  openQueueRows: number;
  inReviewQueueRows: number;
  remainingParabenHolds: number;
  genericAliasRows: number;
  compatibilityRuleRows: number;
  legacyMatchRows: number;
  finalProductSpecificSeeds: number;
  verifiedMappingRows: number;
  verifiedHoldRows: number;
  finalMigrationHistoryRows: number;
};

export type ExternalProjectDatabaseEvidence = {
  metrics: ExternalProjectDatabaseMetrics;
  mappingIds: string[];
  holdIds: string[];
  databaseEvidenceSha256: string;
  readOnlyVerified: true;
};

function asRecord(
  value: unknown,
): JsonRecord {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function metadataText(
  metadata: unknown,
  key: string,
): string | null {
  const value = asRecord(metadata)[key];

  return typeof value === "string"
    ? value
    : null;
}

function metadataBoolean(
  metadata: unknown,
  key: string,
): boolean | null {
  const value = asRecord(metadata)[key];

  return typeof value === "boolean"
    ? value
    : null;
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

function assertExactIds(
  label: string,
  actualIds: string[],
  expectedIds: readonly string[],
): void {
  const actual = [...actualIds].sort();
  const expected = [...expectedIds].sort();

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

function exactRow<T extends { id: string }>(
  rows: readonly T[],
  id: string,
  label: string,
): T {
  const matches = rows.filter(
    (row) => row.id === id,
  );

  if (matches.length !== 1) {
    throw new Error(
      `${label} expected exactly one row for ${id}; found ${matches.length}.`,
    );
  }

  return matches[0];
}

function roundCoverage(
  matched: number,
  total: number,
): number {
  if (total === 0) {
    return 0;
  }

  return Math.round(
    (matched / total) * 10_000,
  ) / 100;
}

function sha256(
  value: string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function sortedById<T extends { id: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (left, right) =>
      left.id.localeCompare(right.id),
  );
}

export function evaluateExternalProjectDatabaseEvidence(
  profile: ExternalProjectCompletionProfile,
  snapshot: ExternalProjectDatabaseSnapshot,
): ExternalProjectDatabaseEvidence {
  const launchProductIds =
    new Set(profile.launchProductIds);

  assertExactIds(
    "Launch products",
    snapshot.products.map(
      (row) => row.id,
    ),
    profile.launchProductIds,
  );

  for (const product of snapshot.products) {
    if (product.approval_status === "archived") {
      throw new Error(
        `Governed launch product is archived: ${product.id}`,
      );
    }
  }

  for (
    const ingredient of
    snapshot.productIngredients
  ) {
    if (
      !launchProductIds.has(
        ingredient.product_id,
      )
    ) {
      throw new Error(
        `Product ingredient is outside the governed launch scope: ${ingredient.id}`,
      );
    }
  }

  for (const queueRow of snapshot.queueRows) {
    if (
      !launchProductIds.has(
        queueRow.product_id,
      )
    ) {
      throw new Error(
        `Review-queue row is outside the governed launch scope: ${queueRow.id}`,
      );
    }
  }

  const matchedRows =
    snapshot.productIngredients.filter(
      (row) =>
        row.ingredient_id !== null &&
        (
          row.match_status ===
            "approved_match" ||
          row.match_status ===
            "alias_match"
        ),
    );

  const unmatchedRows =
    snapshot.productIngredients.filter(
      (row) =>
        row.ingredient_id === null &&
        row.match_status === "unmatched",
    );

  const openQueueRows =
    snapshot.queueRows.filter(
      (row) =>
        row.status === "open" &&
        row.resolved_ingredient_id === null,
    );

  const inReviewQueueRows =
    snapshot.queueRows.filter(
      (row) =>
        row.status === "in_review" &&
        row.resolved_ingredient_id === null,
    );

  const remainingParabenHolds =
    inReviewQueueRows.filter(
      (row) =>
        row.normalized_ingredient_name ===
        "パラベン",
    );

  let verifiedMappingRows = 0;

  for (const mapping of profile.mappings) {
    const productRow = exactRow(
      snapshot.productIngredients,
      mapping.productIngredientId,
      "Product-specific mapping",
    );

    assertEqual(
      `${mapping.actionKey} product`,
      productRow.product_id,
      mapping.productId,
    );

    assertEqual(
      `${mapping.actionKey} source name`,
      productRow.ingredient_name,
      mapping.sourceName,
    );

    assertEqual(
      `${mapping.actionKey} normalized source`,
      productRow.normalized_ingredient_name,
      mapping.normalizedSourceName,
    );

    assertEqual(
      `${mapping.actionKey} canonical ID`,
      productRow.ingredient_id,
      mapping.canonicalId,
    );

    assertEqual(
      `${mapping.actionKey} match status`,
      productRow.match_status,
      "approved_match",
    );

    assertEqual(
      `${mapping.actionKey} review status`,
      productRow.review_status,
      "approved",
    );

    assertEqual(
      `${mapping.actionKey} resolved build`,
      metadataText(
        productRow.metadata,
        "resolved_by_build",
      ),
      "BDNA-ING-0004",
    );

    assertEqual(
      `${mapping.actionKey} resolved batch`,
      metadataText(
        productRow.metadata,
        "resolved_by_batch",
      ),
      "final_product_specific_resolution",
    );

    assertEqual(
      `${mapping.actionKey} product-specific flag`,
      metadataBoolean(
        productRow.metadata,
        "product_specific_resolution_only",
      ),
      true,
    );

    assertEqual(
      `${mapping.actionKey} alias flag`,
      metadataBoolean(
        productRow.metadata,
        "global_alias_created",
      ),
      false,
    );

    const queueRow = exactRow(
      snapshot.queueRows,
      mapping.queueId,
      "Resolved review-queue mapping",
    );

    assertEqual(
      `${mapping.actionKey} queue product`,
      queueRow.product_id,
      mapping.productId,
    );

    assertEqual(
      `${mapping.actionKey} queue source`,
      queueRow.ingredient_name,
      mapping.sourceName,
    );

    assertEqual(
      `${mapping.actionKey} queue normalized source`,
      queueRow.normalized_ingredient_name,
      mapping.normalizedSourceName,
    );

    assertEqual(
      `${mapping.actionKey} queue status`,
      queueRow.status,
      "resolved",
    );

    assertEqual(
      `${mapping.actionKey} queue canonical ID`,
      queueRow.resolved_ingredient_id,
      mapping.canonicalId,
    );

    assertEqual(
      `${mapping.actionKey} queue resolved build`,
      metadataText(
        queueRow.metadata,
        "resolved_by_build",
      ),
      "BDNA-ING-0004",
    );

    assertEqual(
      `${mapping.actionKey} queue resolved batch`,
      metadataText(
        queueRow.metadata,
        "resolved_by_batch",
      ),
      "final_product_specific_resolution",
    );

    assertEqual(
      `${mapping.actionKey} queue alias flag`,
      metadataBoolean(
        queueRow.metadata,
        "global_alias_created",
      ),
      false,
    );

    const canonicalRow = exactRow(
      snapshot.intelligenceRows,
      mapping.canonicalId,
      "Canonical Ingredient Intelligence",
    );

    assertEqual(
      `${mapping.actionKey} canonical name`,
      canonicalRow.ingredient_name,
      mapping.canonicalName,
    );

    assertEqual(
      `${mapping.actionKey} canonical review`,
      canonicalRow.review_status,
      "approved",
    );

    verifiedMappingRows += 1;
  }

  let verifiedHoldRows = 0;

  for (const hold of profile.holds) {
    const productRow = exactRow(
      snapshot.productIngredients,
      hold.productIngredientId,
      "Governed held product ingredient",
    );

    assertEqual(
      `${hold.actionKey} product`,
      productRow.product_id,
      hold.productId,
    );

    assertEqual(
      `${hold.actionKey} source name`,
      productRow.ingredient_name,
      hold.sourceName,
    );

    assertEqual(
      `${hold.actionKey} normalized source`,
      productRow.normalized_ingredient_name,
      hold.normalizedSourceName,
    );

    assertEqual(
      `${hold.actionKey} ingredient ID`,
      productRow.ingredient_id,
      null,
    );

    assertEqual(
      `${hold.actionKey} match status`,
      productRow.match_status,
      "unmatched",
    );

    assertEqual(
      `${hold.actionKey} review status`,
      productRow.review_status,
      "needs_review",
    );

    assertEqual(
      `${hold.actionKey} identity review status`,
      metadataText(
        productRow.metadata,
        "identity_review_status",
      ),
      hold.expectedIdentityReviewStatus,
    );

    assertEqual(
      `${hold.actionKey} held build`,
      metadataText(
        productRow.metadata,
        "held_by_build",
      ),
      hold.expectedHeldByBuild,
    );

    assertEqual(
      `${hold.actionKey} held batch`,
      metadataText(
        productRow.metadata,
        "held_by_batch",
      ),
      hold.expectedHeldByBatch,
    );

    const queueRow = exactRow(
      snapshot.queueRows,
      hold.queueId,
      "Governed held review-queue row",
    );

    assertEqual(
      `${hold.actionKey} queue product`,
      queueRow.product_id,
      hold.productId,
    );

    assertEqual(
      `${hold.actionKey} queue source`,
      queueRow.ingredient_name,
      hold.sourceName,
    );

    assertEqual(
      `${hold.actionKey} queue normalized source`,
      queueRow.normalized_ingredient_name,
      hold.normalizedSourceName,
    );

    assertEqual(
      `${hold.actionKey} queue status`,
      queueRow.status,
      "in_review",
    );

    assertEqual(
      `${hold.actionKey} queue resolved ID`,
      queueRow.resolved_ingredient_id,
      null,
    );

    assertEqual(
      `${hold.actionKey} queue action`,
      metadataText(
        queueRow.metadata,
        "action",
      ),
      "hold_ambiguous_identity",
    );

    assertEqual(
      `${hold.actionKey} queue held build`,
      metadataText(
        queueRow.metadata,
        "held_by_build",
      ),
      hold.expectedHeldByBuild,
    );

    assertEqual(
      `${hold.actionKey} queue held batch`,
      metadataText(
        queueRow.metadata,
        "held_by_batch",
      ),
      hold.expectedHeldByBatch,
    );

    verifiedHoldRows += 1;
  }

  const finalProductSpecificSeeds =
    snapshot.intelligenceRows.filter(
      (row) =>
        row.review_status === "approved" &&
        metadataText(
          row.metadata,
          "build_id",
        ) === "BDNA-ING-0004" &&
        metadataText(
          row.metadata,
          "batch_id",
        ) ===
          "final_product_specific_resolution" &&
        metadataText(
          row.metadata,
          "record_type",
        ) ===
          "product_specific_verified_identity_seed",
    ).length;

  const metrics: ExternalProjectDatabaseMetrics = {
    launchProducts:
      snapshot.products.length,

    ingredientOccurrences:
      snapshot.productIngredients.length,

    matchedOccurrences:
      matchedRows.length,

    governedUnmatchedOccurrences:
      unmatchedRows.length,

    coveragePercent:
      roundCoverage(
        matchedRows.length,
        snapshot.productIngredients.length,
      ),

    openQueueRows:
      openQueueRows.length,

    inReviewQueueRows:
      inReviewQueueRows.length,

    remainingParabenHolds:
      remainingParabenHolds.length,

    genericAliasRows:
      snapshot.aliasRows.length,

    compatibilityRuleRows:
      snapshot.compatibilityRuleRows,

    legacyMatchRows:
      snapshot.legacyMatchRows,

    finalProductSpecificSeeds,

    verifiedMappingRows,

    verifiedHoldRows,

    finalMigrationHistoryRows:
      snapshot.finalMigrationHistoryRows,
  };

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
      metrics[
        key as keyof
          ExternalProjectDatabaseMetrics
      ],
      expected,
    );
  }

  const databaseEvidenceSha256 =
    sha256(
      JSON.stringify({
        profileKey:
          profile.profileKey,
        products:
          sortedById(snapshot.products),
        productIngredients:
          sortedById(
            snapshot.productIngredients,
          ),
        queueRows:
          sortedById(snapshot.queueRows),
        intelligenceRows:
          sortedById(
            snapshot.intelligenceRows,
          ),
        aliasRows:
          sortedById(snapshot.aliasRows),
        compatibilityRuleRows:
          snapshot.compatibilityRuleRows,
        legacyMatchRows:
          snapshot.legacyMatchRows,
        finalMigrationHistoryRows:
          snapshot.finalMigrationHistoryRows,
        metrics,
      }),
    );

  return {
    metrics,
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
    databaseEvidenceSha256,
    readOnlyVerified: true,
  };
}