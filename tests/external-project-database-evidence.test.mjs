import assert from "node:assert/strict";
import test from "node:test";

import {
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
} from "../src/lib/qa/external-project-completion-profile.ts";

import {
  evaluateExternalProjectDatabaseEvidence,
} from "../src/lib/qa/external-project-database-evidence.ts";

const profile =
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE;

function mappingProductRow(mapping) {
  return {
    id: mapping.productIngredientId,
    product_id: mapping.productId,
    ingredient_id: mapping.canonicalId,
    ingredient_name: mapping.sourceName,
    normalized_ingredient_name:
      mapping.normalizedSourceName,
    match_status: "approved_match",
    review_status: "approved",
    metadata: {
      resolved_by_build:
        "BDNA-ING-0004",
      resolved_by_batch:
        "final_product_specific_resolution",
      product_specific_resolution_only:
        true,
      global_alias_created:
        false,
    },
  };
}

function mappingQueueRow(mapping) {
  return {
    id: mapping.queueId,
    product_id: mapping.productId,
    ingredient_name: mapping.sourceName,
    normalized_ingredient_name:
      mapping.normalizedSourceName,
    status: "resolved",
    resolved_ingredient_id:
      mapping.canonicalId,
    metadata: {
      resolved_by_build:
        "BDNA-ING-0004",
      resolved_by_batch:
        "final_product_specific_resolution",
      product_specific_resolution_only:
        true,
      global_alias_created:
        false,
    },
  };
}

function holdProductRow(hold) {
  const metadata = {
    identity_review_status:
      hold.expectedIdentityReviewStatus,
    held_by_build:
      hold.expectedHeldByBuild,
  };

  if (
    hold.expectedHeldByBatch !== null
  ) {
    metadata.held_by_batch =
      hold.expectedHeldByBatch;
  }

  return {
    id: hold.productIngredientId,
    product_id: hold.productId,
    ingredient_id: null,
    ingredient_name: hold.sourceName,
    normalized_ingredient_name:
      hold.normalizedSourceName,
    match_status: "unmatched",
    review_status: "needs_review",
    metadata,
  };
}

function holdQueueRow(hold) {
  const metadata = {
    action: "hold_ambiguous_identity",
    held_by_build:
      hold.expectedHeldByBuild,
  };

  if (
    hold.expectedHeldByBatch !== null
  ) {
    metadata.held_by_batch =
      hold.expectedHeldByBatch;
  }

  return {
    id: hold.queueId,
    product_id: hold.productId,
    ingredient_name: hold.sourceName,
    normalized_ingredient_name:
      hold.normalizedSourceName,
    status: "in_review",
    resolved_ingredient_id: null,
    metadata,
  };
}

function intelligenceRow(mapping) {
  const isNewSeed =
    mapping.canonicalName ===
      "Polysorbate 60" ||
    mapping.canonicalName ===
      "Methylparaben";

  return {
    id: mapping.canonicalId,
    ingredient_name:
      mapping.canonicalName,
    normalized_name:
      mapping.canonicalName
        .toLowerCase(),
    normalized_ingredient_name:
      mapping.canonicalName
        .toLowerCase(),
    review_status: "approved",
    metadata: isNewSeed
      ? {
          build_id:
            "BDNA-ING-0004",
          batch_id:
            "final_product_specific_resolution",
          record_type:
            "product_specific_verified_identity_seed",
        }
      : {},
  };
}

function createSnapshot() {
  const mappingRows =
    profile.mappings.map(
      mappingProductRow,
    );

  const holdRows =
    profile.holds.map(
      holdProductRow,
    );

  const genericMatchedRows =
    Array.from(
      {
        length: 161,
      },
      (_, index) => ({
        id:
          `generic-product-ingredient-${index}`,
        product_id:
          profile.launchProductIds[
            index %
            profile.launchProductIds.length
          ],
        ingredient_id:
          `generic-canonical-${index}`,
        ingredient_name:
          `Generic Ingredient ${index}`,
        normalized_ingredient_name:
          `generic ingredient ${index}`,
        match_status:
          index % 2 === 0
            ? "approved_match"
            : "alias_match",
        review_status: "approved",
        metadata: {
          resolved_by_build:
            "BDNA-ING-0004",
        },
      }),
    );

  return {
    products:
      profile.launchProductIds.map(
        (id) => ({
          id,
          approval_status:
            "needs_review",
        }),
      ),

    productIngredients: [
      ...genericMatchedRows,
      ...mappingRows,
      ...holdRows,
    ],

    queueRows: [
      ...profile.mappings.map(
        mappingQueueRow,
      ),
      ...profile.holds.map(
        holdQueueRow,
      ),
    ],

    intelligenceRows:
      profile.mappings.map(
        intelligenceRow,
      ),

    aliasRows: [],

    compatibilityRuleRows: 0,

    legacyMatchRows: 0,

    finalMigrationHistoryRows: 1,
  };
}

test(
  "verifies the exact governed database snapshot",
  () => {
    const evidence =
      evaluateExternalProjectDatabaseEvidence(
        profile,
        createSnapshot(),
      );

    assert.deepEqual(
      evidence.metrics,
      {
        launchProducts: 5,
        ingredientOccurrences: 167,
        matchedOccurrences: 164,
        governedUnmatchedOccurrences: 3,
        coveragePercent: 98.2,
        openQueueRows: 0,
        inReviewQueueRows: 3,
        remainingParabenHolds: 1,
        genericAliasRows: 0,
        compatibilityRuleRows: 0,
        legacyMatchRows: 0,
        finalProductSpecificSeeds: 2,
        verifiedMappingRows: 3,
        verifiedHoldRows: 3,
        finalMigrationHistoryRows: 1,
      },
    );

    assert.match(
      evidence.databaseEvidenceSha256,
      /^[0-9a-f]{64}$/,
    );

    assert.equal(
      evidence.readOnlyVerified,
      true,
    );
  },
);

test(
  "fails when an ingredient occurrence is missing",
  () => {
    const snapshot = createSnapshot();

    snapshot.productIngredients =
      snapshot.productIngredients.filter(
        (row) =>
          row.id !==
          "generic-product-ingredient-0",
      );

    assert.throws(
      () =>
        evaluateExternalProjectDatabaseEvidence(
          profile,
          snapshot,
        ),
      /ingredientOccurrences/,
    );
  },
);

test(
  "fails when mapping metadata is not governed",
  () => {
    const snapshot = createSnapshot();

    const target =
      snapshot.productIngredients.find(
        (row) =>
          row.id ===
          profile.mappings[0]
            .productIngredientId,
      );

    target.metadata.resolved_by_build =
      "WRONG-BUILD";

    assert.throws(
      () =>
        evaluateExternalProjectDatabaseEvidence(
          profile,
          snapshot,
        ),
      /resolved build/,
    );
  },
);

test(
  "fails when a governed hold is resolved",
  () => {
    const snapshot = createSnapshot();

    const target =
      snapshot.productIngredients.find(
        (row) =>
          row.id ===
          profile.holds[0]
            .productIngredientId,
      );

    target.ingredient_id =
      "unexpected-canonical";
    target.match_status =
      "approved_match";

    assert.throws(
      () =>
        evaluateExternalProjectDatabaseEvidence(
          profile,
          snapshot,
        ),
      /ingredient ID/,
    );
  },
);

test(
  "fails when a generic alias exists",
  () => {
    const snapshot = createSnapshot();

    snapshot.aliasRows.push({
      id: "unexpected-alias",
      normalized_alias_name:
        profile.mappings[0]
          .normalizedSourceName,
      ingredient_id:
        profile.mappings[0]
          .canonicalId,
    });

    assert.throws(
      () =>
        evaluateExternalProjectDatabaseEvidence(
          profile,
          snapshot,
        ),
      /genericAliasRows/,
    );
  },
);

test(
  "fails when final migration history is absent",
  () => {
    const snapshot = createSnapshot();

    snapshot.finalMigrationHistoryRows = 0;

    assert.throws(
      () =>
        evaluateExternalProjectDatabaseEvidence(
          profile,
          snapshot,
        ),
      /finalMigrationHistoryRows/,
    );
  },
);

test(
  "does not mutate the supplied database snapshot",
  () => {
    const snapshot = createSnapshot();

    const before =
      structuredClone(snapshot);

    evaluateExternalProjectDatabaseEvidence(
      profile,
      snapshot,
    );

    assert.deepEqual(
      snapshot,
      before,
    );
  },
);