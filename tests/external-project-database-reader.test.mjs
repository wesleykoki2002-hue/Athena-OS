import assert from "node:assert/strict";
import test from "node:test";

import {
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
} from "../src/lib/qa/external-project-completion-profile.ts";

import {
  loadExternalProjectDatabaseSnapshot,
} from "../src/lib/qa/external-project-database-reader.ts";

const profile =
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE;

function successResult(data) {
  return {
    data,
    error: null,
    count: null,
  };
}

function countResult(count) {
  return {
    data: null,
    error: null,
    count,
  };
}

function createFakeSupabase(overrides = {}) {
  const operations = [];

  const results = {
    beautydna_products:
      successResult(
        profile.launchProductIds.map(
          (id) => ({
            id,
            approval_status:
              "needs_review",
          }),
        ),
      ),

    beautydna_product_ingredients:
      successResult([]),

    beautydna_ingredient_review_queue:
      successResult([]),

    beautydna_ingredient_intelligence:
      successResult([]),

    beautydna_ingredient_aliases:
      successResult([]),

    beautydna_ingredient_compatibility_rules:
      countResult(0),

    beautydna_product_ingredient_matches:
      countResult(0),

    ...overrides,
  };

  return {
    operations,

    client: {
      from(table) {
        return {
          select(columns, options) {
            const operation = {
              operation: "select",
              table,
              columns,
              options: options ?? null,
              filter: null,
            };

            operations.push(operation);

            const result = results[table];

            if (!result) {
              throw new Error(
                `Unexpected table: ${table}`,
              );
            }

            return {
              in(column, values) {
                operation.filter = {
                  type: "in",
                  column,
                  values: [...values],
                };

                return Promise.resolve(
                  result,
                );
              },

              then(resolve, reject) {
                return Promise.resolve(
                  result,
                ).then(
                  resolve,
                  reject,
                );
              },
            };
          },
        };
      },
    },
  };
}

test(
  "loads the governed snapshot using read-only queries",
  async () => {
    const fake =
      createFakeSupabase();

    const snapshot =
      await loadExternalProjectDatabaseSnapshot(
        profile,
        fake.client,
        {
          finalMigrationHistoryRows: 1,
        },
      );

    assert.equal(
      snapshot.products.length,
      5,
    );

    assert.equal(
      snapshot.compatibilityRuleRows,
      0,
    );

    assert.equal(
      snapshot.legacyMatchRows,
      0,
    );

    assert.equal(
      snapshot.finalMigrationHistoryRows,
      1,
    );

    assert.equal(
      fake.operations.length,
      7,
    );

    assert.equal(
      fake.operations.every(
        (operation) =>
          operation.operation ===
          "select",
      ),
      true,
    );
  },
);

test(
  "uses exact governed product, canonical, and source filters",
  async () => {
    const fake =
      createFakeSupabase();

    await loadExternalProjectDatabaseSnapshot(
      profile,
      fake.client,
      {
        finalMigrationHistoryRows: 1,
      },
    );

    const productOperation =
      fake.operations.find(
        (operation) =>
          operation.table ===
          "beautydna_products",
      );

    assert.deepEqual(
      productOperation.filter.values,
      [...profile.launchProductIds]
        .sort(),
    );

    const intelligenceOperation =
      fake.operations.find(
        (operation) =>
          operation.table ===
          "beautydna_ingredient_intelligence",
      );

    assert.deepEqual(
      intelligenceOperation.filter.values,
      profile.mappings
        .map(
          (mapping) =>
            mapping.canonicalId,
        )
        .sort(),
    );

    const aliasOperation =
      fake.operations.find(
        (operation) =>
          operation.table ===
          "beautydna_ingredient_aliases",
      );

    assert.deepEqual(
      aliasOperation.filter.values,
      [
        "poe・ジメチコン共重合体",
        "α-オレフィンオリゴマー",
        "エデト酸塩",
        "ステアリン酸poeソルビタン",
        "パラベン",
      ].sort(),
    );
  },
);

test(
  "surfaces a governed table read failure",
  async () => {
    const fake =
      createFakeSupabase({
        beautydna_product_ingredients:
          {
            data: null,
            error: {
              message:
                "fixture read failure",
            },
            count: null,
          },
      });

    await assert.rejects(
      loadExternalProjectDatabaseSnapshot(
        profile,
        fake.client,
        {
          finalMigrationHistoryRows: 1,
        },
      ),
      /beautydna_product_ingredients read failed: fixture read failure/,
    );
  },
);

test(
  "rejects invalid migration-history evidence before querying",
  async () => {
    const fake =
      createFakeSupabase();

    await assert.rejects(
      loadExternalProjectDatabaseSnapshot(
        profile,
        fake.client,
        {
          finalMigrationHistoryRows:
            -1,
        },
      ),
      /non-negative integer/,
    );

    assert.equal(
      fake.operations.length,
      0,
    );
  },
);

test(
  "does not mutate the governed profile",
  async () => {
    const fake =
      createFakeSupabase();

    const before =
      structuredClone(profile);

    await loadExternalProjectDatabaseSnapshot(
      profile,
      fake.client,
      {
        finalMigrationHistoryRows: 1,
      },
    );

    assert.deepEqual(
      profile,
      before,
    );
  },
);