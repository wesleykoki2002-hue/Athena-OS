export type ExternalProjectProductDnaPacketIdentity = {
  project_key: string;
  module_key: string;
  build_session_title: string;
};

export type ExternalProjectProductDnaProfile = {
  profileKey: string;

  packetIdentity:
    ExternalProjectProductDnaPacketIdentity;

  launchProducts: readonly {
    productId: string;
    dnaId: string;
    sourceKey: string;
  }[];

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

  sourceFiles: readonly {
    relativePath: string;
    normalizedSha256: string;
  }[];

  expectedMetrics: {
    approvedProducts: number;
    approvedProductDnaRows: number;
    shopifyUnlinkedProducts: number;
    recommendationReadyProducts: number;
    preservedUnmatchedIngredients: number;
  };

  expectedSecurity: {
    migrationSecurityTokenCount: number;
  };

  preservedUnmatched: readonly {
    productIngredientId: string;
    identityReviewStatus: string;
  }[];

  runtimeEvidence: {
    relativePath: string;
    evidenceVersion: string;
  };
};

export const
BDNA_PDNA_0001_EXTERNAL_PRODUCT_DNA_PROFILE = {
  profileKey:
    "beautydna-product-dna-bdna-pdna-0001",

  packetIdentity: {
    project_key:
      "beautydna",

    module_key:
      "product-dna-database",

    build_session_title:
      "BDNA-PDNA-0001 Launch Product DNA Evidence Review, Approval Cleanup, and Production Recommendation Readiness",
  },

  launchProducts: [
    {
      productId:
        "5677258a-87b5-48b7-acb0-02b855e2f167",
      dnaId:
        "02ac259e-dc07-40c8-9254-c7d22d2fc4df",
      sourceKey:
        "BDNA-ING-0003-gentle-cleanser-curel-4901301269348",
    },
    {
      productId:
        "48faa3de-bfe6-4e4c-9958-754088754f50",
      dnaId:
        "906e61dd-654d-4086-b185-21bfc6a725b7",
      sourceKey:
        "BDNA-ING-0003-hydrating-lotion-hada-labo-167012",
    },
    {
      productId:
        "349821be-6f9a-4e4f-bf84-b922986547ca",
      dnaId:
        "19b563e7-c8f5-4768-8e0a-fc9503a5b592",
      sourceKey:
        "BDNA-ING-0003-barrier-serum-etvos-cn10694",
    },
    {
      productId:
        "41f6385a-0d61-4cb3-ac7a-fdaf9c294031",
      dnaId:
        "8deca43e-b74b-443d-9f6e-0d2c89e03272",
      sourceKey:
        "BDNA-ING-0003-moisturizer-curel-4901301236210",
    },
    {
      productId:
        "976f45a3-a673-4dc7-b6a7-2e4a24b32e35",
      dnaId:
        "e5d97b2f-98b2-469d-94fc-fdb0ad1cd353",
      sourceKey:
        "BDNA-ING-0003-sunscreen-anessa-h16501",
    },
  ],

  target: {
    supabaseProjectRef:
      "hidsyvanaipxxyyhjgmc",

    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/beauty-os.git",

    repositoryBranch:
      "bdna-pdna-0001-launch-product-dna-readiness",

    repositoryHead:
      "51cfb6598f87cb0a3085136472a8bd19d0715b39",

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
        "supabase/migrations/20260817001000_bdna_pdna_0001_launch_product_dna_readiness.sql",

      sha256:
        "055b4d6aa8287767a51e3e29e5cf3a7925c9e8049f325cea5636cb5896d4bc31",
    },
  ],

  sourceFiles: [
    {
      relativePath:
        "supabase/functions/beautydna-v2-recommendation-generate/index.ts",

      normalizedSha256:
        "f901aaa7807b1b17d4445f593ea7c695afdd0e714e4fe575757d0dee3968b657",
    },
    {
      relativePath:
        "supabase/functions/beautydna-v2-recommendation-explain/index.ts",

      normalizedSha256:
        "5181486df6228a2001fbc5348c8d3361e801d282d34935a1c051aff8a0cd85a3",
    },
    {
      relativePath:
        "supabase/functions/beautydna-v2-shopify-result/index.ts",

      normalizedSha256:
        "2789fab9c33328f106f2caa4ead767a54fbf2c41137e99d8756bc4e7859a424e",
    },
  ],

  expectedMetrics: {
    approvedProducts: 5,
    approvedProductDnaRows: 5,
    shopifyUnlinkedProducts: 5,
    recommendationReadyProducts: 0,
    preservedUnmatchedIngredients: 3,
  },

  expectedSecurity: {
    migrationSecurityTokenCount: 0,
  },

  preservedUnmatched: [
    {
      productIngredientId:
        "30e352fb-9a5f-4b8b-b96f-7d224a9b1bad",

      identityReviewStatus:
        "ambiguous_product_specific_identity",
    },
    {
      productIngredientId:
        "e24bafb4-2917-4b1e-a7fd-c1740784e8ed",

      identityReviewStatus:
        "ambiguous_product_specific_identity",
    },
    {
      productIngredientId:
        "2bc80b34-1c9a-457b-a468-cbb53f29c53e",

      identityReviewStatus:
        "ambiguous_class_label",
    },
  ],

  runtimeEvidence: {
    relativePath:
      "evidence/external-projects/bdna-pdna-0001-runtime-acceptance.json",

    evidenceVersion:
      "bdna-pdna-0001-runtime-acceptance-v1",
  },
} as const satisfies ExternalProjectProductDnaProfile;

const EXTERNAL_PROJECT_PRODUCT_DNA_PROFILES = [
  BDNA_PDNA_0001_EXTERNAL_PRODUCT_DNA_PROFILE,
] as const;

export function
selectExternalProjectProductDnaProfile(
  packet:
    ExternalProjectProductDnaPacketIdentity,
): ExternalProjectProductDnaProfile | null {
  return (
    EXTERNAL_PROJECT_PRODUCT_DNA_PROFILES.find(
      (profile) =>
        profile.packetIdentity.project_key ===
          packet.project_key &&
        profile.packetIdentity.module_key ===
          packet.module_key &&
        profile.packetIdentity
          .build_session_title ===
          packet.build_session_title,
    ) ?? null
  );
}