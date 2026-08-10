export type ExternalProjectRepositoryOnlyPacketIdentity = {
  id?: string;
  project_key: string;
  module_key: string;
  build_session_title: string;
};

export type ExternalProjectRepositoryOnlyProfile = {
  profileKey: string;
  packetIdentity: ExternalProjectRepositoryOnlyPacketIdentity;
  target: {
    repositoryRemote: string;
    repositoryBranch: string;
    repositoryHead: string;
    repositoryTree: string;
    repositoryPathEnvironment: string;
    repositoryPathFallbacks: readonly string[];
  };
  expectedChangedFiles: readonly string[];
  requiredFiles: readonly {
    relativePath: string;
    sha256: string;
  }[];
  validationEvidence: {
    relativePath: string;
    sha256: string;
    evidenceVersion: string;
    buildId: string;
    expectedUnitTestCount: number;
    requiredTrueFields: readonly string[];
    resolveCalculationFromValidation?: boolean;
  };
  callableContract: {
    relativePath: string;
    requiredTokens: readonly string[];
  };
};

export const HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0001-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0001 Campaign Foundation, Claim Governance, and Approval Preflight",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0001-campaign-foundation",
    repositoryHead:
      "b93a2d2d15758c0b212d5a18a320b8995b822c53",
    repositoryTree:
      "b15699e48bb41c3a9446b50cbf9d5f849c1983f7",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "scripts/campaignctl.py",
    "tests/test_campaignctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "schemas/campaign-package.schema.json",
      sha256: "19c0f8d02ef121cac50d7c5a65df0b8de102cfc62770e1327b28e9bd0b43fb58",
    },
    {
      relativePath: "scripts/campaignctl.py",
      sha256: "8d1f1b3ad3ebb74efa38f519bbbd78a17ae0cc0547b211d7a00f4deea94c1649",
    },
    {
      relativePath: "tests/test_campaign_schema.py",
      sha256: "737c9589808ef8a47f9285d1bbc857a30e4e44f37c067b041307d0e7a8e1c50c",
    },
    {
      relativePath: "tests/test_campaignctl.py",
      sha256: "568d2decaa1ada64c9efb62ffb55d220a5a8f109e7c203fd47f22c763ed28820",
    },
  ],
  validationEvidence: {
    relativePath: "evidence/external-projects/hanna-mkt-0001-repository-only.json",
    sha256: "17d1e487adb734b4b83f4374dc6b4c55d05893340e365dc6a8ed7f348ddd657f",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0001",
    expectedUnitTestCount: 32,
    requiredTrueFields: [
      "canonical_draft_2020_12_schema_verified",
      "cli_validation_passed",
      "approval_checks_blocked_as_expected",
      "blocked_approve_exited_nonzero",
      "campaign_sha_preserved",
      "ledger_sha_preserved",
      "deterministic_preflight_verified",
    ],
  },
  callableContract: {
    relativePath: "scripts/campaignctl.py",
    requiredTokens: ["check-approval", "approve", "validate"],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;

export const HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0002-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0002 Canonical Knowledge Sync and Product Repository Foundation",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0002-knowledge-sync-product-repository",
    repositoryHead:
      "378ef70c23d20315fc7c2a301d3b8c8370ea693f",
    repositoryTree:
      "adf8b25c54acc9193b4bbe910336f5c63aeb661c",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "knowledge/README.md",
    "knowledge/current.json",
    "knowledge/snapshots/HANNA-KNOWLEDGE-20260809-001.json",
    "knowledge/source-registry.json",
    "products/catalog.json",
    "schemas/knowledge-snapshot.schema.json",
    "schemas/product-registry.schema.json",
    "scripts/knowledgectl.py",
    "tests/test_knowledgectl.py",
  ],
  requiredFiles: [
    { relativePath: "knowledge/README.md", sha256: "85b2ff33b238ed58f75aea87f2934a424f58e7c7c0c8309d68647df976b838a2" },
    { relativePath: "knowledge/current.json", sha256: "ca5a279cfdf0ea8e2b9d8a87bc9f37dd476f4c0f0bf843507741f772f53fc61b" },
    { relativePath: "knowledge/snapshots/HANNA-KNOWLEDGE-20260809-001.json", sha256: "6f13bbbb9a41e9cd316b9959ee0d69adbb4be6edb096a5064c7e13f8a5aabe8a" },
    { relativePath: "knowledge/source-registry.json", sha256: "f5878de537e9cef7c612a3b28113fd82d1bd742415a95dc344f87cf5a765565d" },
    { relativePath: "products/catalog.json", sha256: "e8f8b760135729209e1b7a5ef7f319bcd89fb0790e680dd128383f7248504225" },
    { relativePath: "schemas/knowledge-snapshot.schema.json", sha256: "3a4770a3f417f3eeeafdfbce19b32dd8c8a6087dbfc466ce80a16366e2c56d77" },
    { relativePath: "schemas/product-registry.schema.json", sha256: "9e12379de40105d5304bc7b3b4e5e4f344dd9ad4f84c6cc48e9fe4fcf569652b" },
    { relativePath: "scripts/knowledgectl.py", sha256: "4f3277839cd83152c7cfb27beab195ed5c3b7a4617f66ff1a8393d8c3b23994a" },
    { relativePath: "tests/test_knowledgectl.py", sha256: "8bf97c716ec5352bf739b9abfb76c7bc95634ca8e00dd394bff558d2e0012a14" },
  ],
  validationEvidence: {
    relativePath: "evidence/external-projects/hanna-mkt-0002-repository-only.json",
    sha256: "89b954dc1977969d412c8887034ee0229f7635aa0e6dd7a8eb4a09919efc602a",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0002",
    expectedUnitTestCount: 52,
    requiredTrueFields: [
      "governed_knowledge_validation_passed",
      "focused_mkt_0002_tests_passed",
      "complete_regression_suite_passed",
      "mkt_0001_package_regression_passed",
      "eligible_product_context_verified",
      "blocked_product_fail_closed_verified",
      "canonical_utf8_regression_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/knowledgectl.py",
    requiredTokens: ["validate", "context", "external_action_authorized"],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;

export const HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0003-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0003 Governed Product-to-Campaign Creative Package Foundation",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0003-product-to-campaign-creative-package",
    repositoryHead:
      "986d329aa3df340ce2fbdb98afc80ce1f251d81c",
    repositoryTree:
      "a3fe63e4d0a03f3a83448e94fde1c8d7c61f0058",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "products/asset-manifest.json",
    "schemas/creative-package.schema.json",
    "schemas/creative-request.schema.json",
    "schemas/product-asset-manifest.schema.json",
    "scripts/creativectl.py",
    "tests/test_creativectl.py",
  ],
  requiredFiles: [
    { relativePath: "products/asset-manifest.json", sha256: "095a5dae7cc832409b333b41860376ff4409796a73d666387a090ba42065d47c" },
    { relativePath: "schemas/creative-package.schema.json", sha256: "75e224b7bd49bbfed6afc4d96c002b13f7cc8775c76aa2d232b93cebf13c3184" },
    { relativePath: "schemas/creative-request.schema.json", sha256: "c9b523a432d82c8d43f8ab5ae598a8fef812d391c0a165c113da2a5b9771f5df" },
    { relativePath: "schemas/product-asset-manifest.schema.json", sha256: "26a2a24339124d57a8b078f1ced67cd404c05ecc051eef187376aca194e26755" },
    { relativePath: "scripts/creativectl.py", sha256: "2e2a615239f105aff86e541265af5643dcd4569af43e5bfa351261ecc4d8c9d7" },
    { relativePath: "tests/test_creativectl.py", sha256: "2cd57759f46344effd8b5dc7d201e76545a674b17bf036e4781c9e665253842a" },
  ],
  validationEvidence: {
    relativePath: "evidence/external-projects/hanna-mkt-0003-repository-only.json",
    sha256: "3d13f98400ae7774da22877bc4c3861a196260c16154472185295b7ea29f6c9b",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0003",
    expectedUnitTestCount: 88,
    requiredTrueFields: [
      "governed_creative_foundation_validation_passed",
      "focused_mkt_0003_tests_passed",
      "complete_regression_suite_passed",
      "existing_campaign_regression_passed",
      "missing_asset_fail_closed_verified",
      "blocked_product_fail_closed_verified",
      "canonical_request_rebinding_verified",
      "reference_only_source_fail_closed_verified",
      "source_ledger_binding_verified",
      "asset_provenance_datetime_validation_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/creativectl.py",
    requiredTokens: [
      "validate",
      "request",
      "validate-package",
      "materialize",
      "external_action_authorized",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;
const EXTERNAL_PROJECT_REPOSITORY_ONLY_PROFILES: readonly ExternalProjectRepositoryOnlyProfile[] = [
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE,
];

export function selectExternalProjectRepositoryOnlyProfile(
  packet: ExternalProjectRepositoryOnlyPacketIdentity,
): ExternalProjectRepositoryOnlyProfile | null {
  return EXTERNAL_PROJECT_REPOSITORY_ONLY_PROFILES.find(
    (profile) =>
      (profile.packetIdentity.id === undefined ||
        profile.packetIdentity.id === packet.id) &&
      profile.packetIdentity.project_key === packet.project_key &&
      profile.packetIdentity.module_key === packet.module_key &&
      profile.packetIdentity.build_session_title ===
        packet.build_session_title,
  ) ?? null;
}
