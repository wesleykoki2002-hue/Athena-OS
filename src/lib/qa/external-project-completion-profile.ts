export type ExternalProjectCompletionPacketIdentity = {
  id: string;
  project_key: string;
  module_key: string;
  build_session_title: string;
};

export type ExternalProjectCompletionProfile = {
  profileKey: string;
  packetIdentity: ExternalProjectCompletionPacketIdentity;
  launchProductIds: readonly string[];
  target: {
    supabaseProjectRef: string;
    repositoryRemote: string;
    repositoryBranch: string;
    repositoryHead: string;
    repositoryPathEnvironment: string;
    supabaseUrlEnvironment: string;
    supabaseServiceRoleKeyEnvironment: string;
    supabaseProjectRefEnvironment: string;
  };
  migrations: readonly {
    relativePath: string;
    sha256: string;
  }[];
  expectedMetrics: {
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
  expectedSecurity: {
    rlsEnabledTableCount: number;
    policyCount: number;
    migrationSecurityTokenCount: number;
  };
  liveSecurityEvidence: {
    relativePath: string;
    sha256: string;
    evidenceVersion: string;
    buildId: string;
    finalMigrationVersion: string;
  };
  mappings: readonly {
    actionKey: string;
    productId: string;
    productIngredientId: string;
    queueId: string;
    sourceName: string;
    normalizedSourceName: string;
    canonicalId: string;
    canonicalName: string;
  }[];
  holds: readonly {
    actionKey: string;
    productId: string;
    productIngredientId: string;
    queueId: string;
    sourceName: string;
    normalizedSourceName: string;
    expectedIdentityReviewStatus: string;
    expectedHeldByBatch: string | null;
    expectedHeldByBuild: string;
  }[];
};

export const BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE = {
  profileKey: "beautydna-ingredient-intelligence-bdna-ing-0004",
  packetIdentity: {
    id: "e6f2b740-fdca-4276-a971-504439e43600",
    project_key: "beautydna",
    module_key: "ingredient-intelligence",
    build_session_title:
      "BDNA-ING-0004 Japanese Ingredient Identity Normalization and Review-Queue Processing",
  },
  launchProductIds: [
    "976f45a3-a673-4dc7-b6a7-2e4a24b32e35",
    "5677258a-87b5-48b7-acb0-02b855e2f167",
    "41f6385a-0d61-4cb3-ac7a-fdaf9c294031",
    "349821be-6f9a-4e4f-bf84-b922986547ca",
    "48faa3de-bfe6-4e4c-9958-754088754f50",
  ],
  target: {
    supabaseProjectRef: "hidsyvanaipxxyyhjgmc",
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/beauty-os.git",
    repositoryBranch:
      "bdna-ing-0004-japanese-ingredient-normalization",
    repositoryHead:
      "564bbae118f3b2213f3372842f44126e176cde8a",
    repositoryPathEnvironment:
      "ATHENA_BEAUTY_OS_REPOSITORY_PATH",
    supabaseUrlEnvironment:
      "ATHENA_BEAUTY_OS_SUPABASE_URL",
    supabaseServiceRoleKeyEnvironment:
      "ATHENA_BEAUTY_OS_SUPABASE_SERVICE_ROLE_KEY",
    supabaseProjectRefEnvironment:
      "ATHENA_BEAUTY_OS_SUPABASE_PROJECT_REF",
  },
  migrations: [
    {
      relativePath:
        "supabase/migrations/20260803160500_bdna_ing_0004_japanese_identity_batch_1.sql",
      sha256:
        "84be01f9788f78d056ae401ac674fadf6741ee3cb4bec2d6d864f423a56e03b7",
    },
    {
      relativePath:
        "supabase/migrations/20260803203900_bdna_ing_0004_japanese_identity_batch_2a.sql",
      sha256:
        "98cf01711905e7d781d146383b590b84bfe5be09d62aee89f8b0c894169f4852",
    },
    {
      relativePath:
        "supabase/migrations/20260804001800_bdna_ing_0004_japanese_identity_batch_2b.sql",
      sha256:
        "670602a4051bd48fc870862fa68ed44a51e79d8f6a16e3e9306ff2994182b9f6",
    },
    {
      relativePath:
        "supabase/migrations/20260804092500_bdna_ing_0004_japanese_identity_batch_2c.sql",
      sha256:
        "df2def921886de2ae4f3d283146cb1696a1b6a6635d03a9a995bc9c015e0df2b",
    },
    {
      relativePath:
        "supabase/migrations/20260804110600_bdna_ing_0004_japanese_identity_batch_2d.sql",
      sha256:
        "715b3190363669f8de35f68c18f3e5c69cb10ea7b11b310b7c5b26e9b298db53",
    },
    {
      relativePath:
        "supabase/migrations/20260804112300_bdna_ing_0004_japanese_identity_batch_2e.sql",
      sha256:
        "7f8442df869c89fb3d32f7227250e6a9b456121e48b0a7108110b79939f67067",
    },
    {
      relativePath:
        "supabase/migrations/20260804114500_bdna_ing_0004_japanese_identity_batch_2f.sql",
      sha256:
        "e41525976265d3ffdab1829dd3a77596e4d14236e04a8235f232bf52894e391b",
    },
    {
      relativePath:
        "supabase/migrations/20260804122700_bdna_ing_0004_japanese_identity_batch_2g.sql",
      sha256:
        "bc9ba2774422050547d12441e529be3934cab652a3964b7dacd2227da569c854",
    },
    {
      relativePath:
        "supabase/migrations/20260804124900_bdna_ing_0004_final_product_specific_resolution.sql",
      sha256:
        "6c4c3ecf491adeb68b19415e1cf4f69b90c3818aac17fa4e51cfec57d88f1088",
    },
  ],
  expectedMetrics: {
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
  expectedSecurity: {
    rlsEnabledTableCount: 14,
    policyCount: 0,
    migrationSecurityTokenCount: 0,
  },
  liveSecurityEvidence: {
    relativePath:
      "evidence/external-projects/bdna-ing-0004-live-security.json",
    sha256:
      "131c12aaeb359b9738a614c46b3e75c7d5bd459d066a37f2d5bf050bdc025d21",
    evidenceVersion:
      "athena-external-project-live-security-v1",
    buildId:
      "BDNA-ING-0004",
    finalMigrationVersion:
      "20260804124900",
  },
  mappings: [
    {
      actionKey: "resolve-cleanser-polysorbate-60",
      productId:
        "5677258a-87b5-48b7-acb0-02b855e2f167",
      productIngredientId:
        "e72be638-1aaf-4efa-9eb9-b12c95fa3d6a",
      queueId:
        "ebddc25f-f118-4c26-9afc-d6f701eaae72",
      sourceName:
        "ステアリン酸POEソルビタン",
      normalizedSourceName:
        "ステアリン酸poeソルビタン",
      canonicalId:
        "32f767a2-1e1d-47c1-b756-5e47a7acd643",
      canonicalName: "Polysorbate 60",
    },
    {
      actionKey: "resolve-cleanser-disodium-edta",
      productId:
        "5677258a-87b5-48b7-acb0-02b855e2f167",
      productIngredientId:
        "addc236c-0f78-40fe-8f7e-f2876ae67b3d",
      queueId:
        "dda46e5e-bf9e-493a-b0c7-4574c8590282",
      sourceName:
        "エデト酸塩",
      normalizedSourceName:
        "エデト酸塩",
      canonicalId:
        "22ea1033-f69e-4d50-8358-9faf2c763c11",
      canonicalName: "Disodium EDTA",
    },
    {
      actionKey: "resolve-cleanser-methylparaben",
      productId:
        "5677258a-87b5-48b7-acb0-02b855e2f167",
      productIngredientId:
        "e1f51711-7fd4-4071-bbc5-f0c505dcfd9c",
      queueId:
        "4381e5f9-bbc3-4a1a-b478-7f0e5fcd69cb",
      sourceName:
        "パラベン",
      normalizedSourceName:
        "パラベン",
      canonicalId:
        "e9286ca2-a224-48b3-b571-7639627506b4",
      canonicalName: "Methylparaben",
    },
  ],
  holds: [
    {
      actionKey: "hold-cream-alpha-olefin-oligomer",
      productId:
        "41f6385a-0d61-4cb3-ac7a-fdaf9c294031",
      productIngredientId:
        "30e352fb-9a5f-4b8b-b96f-7d224a9b1bad",
      queueId:
        "73a910ac-fead-49c2-b5b1-c016d04e0793",
      sourceName:
        "α-オレフィンオリゴマー",
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
      productId:
        "41f6385a-0d61-4cb3-ac7a-fdaf9c294031",
      productIngredientId:
        "e24bafb4-2917-4b1e-a7fd-c1740784e8ed",
      queueId:
        "81d456c7-727d-497d-8fff-d9d42d5c3c66",
      sourceName:
        "POE・ジメチコン共重合体",
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
      actionKey: "keep-hold-cream-paraben",
      productId:
        "41f6385a-0d61-4cb3-ac7a-fdaf9c294031",
      productIngredientId:
        "2bc80b34-1c9a-457b-a468-cbb53f29c53e",
      queueId:
        "0a7c2b28-c210-4e84-9232-10e70e4c8c0c",
      sourceName:
        "パラベン",
      normalizedSourceName:
        "パラベン",
      expectedIdentityReviewStatus:
        "ambiguous_class_label",
      expectedHeldByBatch: null,
      expectedHeldByBuild:
        "BDNA-ING-0004",
    },
  ],
} as const satisfies ExternalProjectCompletionProfile;

const EXTERNAL_PROJECT_COMPLETION_PROFILES = [
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
] as const;

export function selectExternalProjectCompletionProfile(
  packet: ExternalProjectCompletionPacketIdentity,
): ExternalProjectCompletionProfile | null {
  return EXTERNAL_PROJECT_COMPLETION_PROFILES.find(
    (profile) =>
      profile.packetIdentity.id === packet.id &&
      profile.packetIdentity.project_key ===
        packet.project_key &&
      profile.packetIdentity.module_key ===
        packet.module_key &&
      profile.packetIdentity.build_session_title ===
        packet.build_session_title,
  ) ?? null;
}