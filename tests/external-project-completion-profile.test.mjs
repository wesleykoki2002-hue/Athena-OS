import assert from "node:assert/strict";
import test from "node:test";

import {
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
  selectExternalProjectCompletionProfile,
} from "../src/lib/qa/external-project-completion-profile.ts";

const exactPacket = {
  ...BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE.packetIdentity,
};

test(
  "selects the exact governed BDNA-ING-0004 completion profile",
  () => {
    assert.equal(
      selectExternalProjectCompletionProfile(exactPacket),
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
    );
  },
);

for (const [field, replacement] of [
  [
    "id",
    "00000000-0000-0000-0000-000000000000",
  ],
  ["project_key", "athena-cto"],
  ["module_key", "other-module"],
  [
    "build_session_title",
    "BDNA-ING-0004 wrong title",
  ],
]) {
  test(
    `rejects a packet with the wrong ${field}`,
    () => {
      assert.equal(
        selectExternalProjectCompletionProfile({
          ...exactPacket,
          [field]: replacement,
        }),
        null,
      );
    },
  );
}

test(
  "stores server-only Beauty OS configuration names without values",
  () => {
    const environmentNames = Object.entries(
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE.target,
    )
      .filter(([key]) =>
        key.endsWith("Environment")
      )
      .map(([, value]) => value);

    assert.deepEqual(environmentNames.sort(), [
      "ATHENA_BEAUTY_OS_REPOSITORY_PATH",
      "ATHENA_BEAUTY_OS_SUPABASE_PROJECT_REF",
      "ATHENA_BEAUTY_OS_SUPABASE_SERVICE_ROLE_KEY",
      "ATHENA_BEAUTY_OS_SUPABASE_URL",
    ]);

    assert.equal(
      environmentNames.some((name) =>
        name.startsWith("NEXT_PUBLIC_")
      ),
      false,
    );
  },
);

test(
  "preserves the governed repository and migration identities",
  () => {
    assert.equal(
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE
        .target.supabaseProjectRef,
      "hidsyvanaipxxyyhjgmc",
    );

    assert.equal(
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE
        .target.repositoryBranch,
      "bdna-ing-0004-japanese-ingredient-normalization",
    );

    assert.equal(
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE
        .target.repositoryHead,
      "564bbae118f3b2213f3372842f44126e176cde8a",
    );

    assert.equal(
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE
        .migrations.length,
      9,
    );

    assert.deepEqual(
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE
        .migrations.at(-1),
      {
        relativePath:
          "supabase/migrations/20260804124900_bdna_ing_0004_final_product_specific_resolution.sql",
        sha256:
          "6c4c3ecf491adeb68b19415e1cf4f69b90c3818aac17fa4e51cfec57d88f1088",
      },
    );
  },
);

test(
  "preserves exact governed metrics and action identities",
  () => {
    const profile =
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE;

    assert.deepEqual(profile.expectedMetrics, {
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
    });

    assert.deepEqual(
      profile.mappings
        .map((mapping) => mapping.canonicalName)
        .sort(),
      [
        "Disodium EDTA",
        "Methylparaben",
        "Polysorbate 60",
      ],
    );

    assert.equal(profile.holds.length, 3);

    assert.equal(
      profile.holds.filter(
        (hold) =>
          hold.expectedHeldByBatch === null,
      ).length,
      1,
    );
  },
);
test(
  "preserves exact launch products and database action evidence",
  () => {
    const profile =
      BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE;

    assert.deepEqual(
      [...profile.launchProductIds].sort(),
      [
        "349821be-6f9a-4e4f-bf84-b922986547ca",
        "41f6385a-0d61-4cb3-ac7a-fdaf9c294031",
        "48faa3de-bfe6-4e4c-9958-754088754f50",
        "5677258a-87b5-48b7-acb0-02b855e2f167",
        "976f45a3-a673-4dc7-b6a7-2e4a24b32e35",
      ],
    );

    assert.deepEqual(
      profile.mappings.map(
        ({
          actionKey,
          canonicalId,
          canonicalName,
          normalizedSourceName,
        }) => ({
          actionKey,
          canonicalId,
          canonicalName,
          normalizedSourceName,
        }),
      ),
      [
        {
          actionKey:
            "resolve-cleanser-polysorbate-60",
          canonicalId:
            "32f767a2-1e1d-47c1-b756-5e47a7acd643",
          canonicalName:
            "Polysorbate 60",
          normalizedSourceName:
            "ステアリン酸poeソルビタン",
        },
        {
          actionKey:
            "resolve-cleanser-disodium-edta",
          canonicalId:
            "22ea1033-f69e-4d50-8358-9faf2c763c11",
          canonicalName:
            "Disodium EDTA",
          normalizedSourceName:
            "エデト酸塩",
        },
        {
          actionKey:
            "resolve-cleanser-methylparaben",
          canonicalId:
            "e9286ca2-a224-48b3-b571-7639627506b4",
          canonicalName:
            "Methylparaben",
          normalizedSourceName:
            "パラベン",
        },
      ],
    );

    assert.deepEqual(
      profile.holds.map(
        ({
          actionKey,
          normalizedSourceName,
          expectedIdentityReviewStatus,
          expectedHeldByBatch,
          expectedHeldByBuild,
        }) => ({
          actionKey,
          normalizedSourceName,
          expectedIdentityReviewStatus,
          expectedHeldByBatch,
          expectedHeldByBuild,
        }),
      ),
      [
        {
          actionKey:
            "hold-cream-alpha-olefin-oligomer",
          normalizedSourceName:
            "α-オレフィンオリゴマー",
          expectedIdentityReviewStatus:
            "ambiguous_product_specific_identity",
          expectedHeldByBatch:
            "final_product_specific_resolution",
          expectedHeldByBuild:
            "BDNA-ING-0004",
        },
        {
          actionKey:
            "hold-cream-poe-dimethicone-copolymer",
          normalizedSourceName:
            "poe・ジメチコン共重合体",
          expectedIdentityReviewStatus:
            "ambiguous_product_specific_identity",
          expectedHeldByBatch:
            "final_product_specific_resolution",
          expectedHeldByBuild:
            "BDNA-ING-0004",
        },
        {
          actionKey:
            "keep-hold-cream-paraben",
          normalizedSourceName:
            "パラベン",
          expectedIdentityReviewStatus:
            "ambiguous_class_label",
          expectedHeldByBatch: null,
          expectedHeldByBuild:
            "BDNA-ING-0004",
        },
      ],
    );
  },
);