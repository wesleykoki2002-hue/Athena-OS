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
  uiContract?: {
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
export const HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0004-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0004 Governed Product Creative Asset Ingestion and Canonical Mapping",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0004-product-creative-asset-ingestion",
    repositoryHead:
      "aa0b2a6409500fb11c85e4798b7bfea038080552",
    repositoryTree:
      "bd52c2eb547a355fe87fbd406124bde83b1d77c8",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "schemas/product-asset-history.schema.json",
    "scripts/assetctl.py",
    "tests/test_assetctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "schemas/product-asset-history.schema.json",
      sha256: "1e3f15ac05b49f992ab3033cb8d27ef19e787adec6ae0f1f79c5c32407999be5",
    },
    {
      relativePath: "scripts/assetctl.py",
      sha256: "a3328794fad8dd3c0ab54f6f06d53e50c507bdc55a021934b55f1926420fe235",
    },
    {
      relativePath: "tests/test_assetctl.py",
      sha256: "b0a8b8049bfa4dff0edfca8432f82fd263c7526ed92c01a77eedbff26826322f",
    },
  ],
  validationEvidence: {
    relativePath: "evidence/external-projects/hanna-mkt-0004-repository-only.json",
    sha256: "66d22332c1326c3840aa144a3fde9fa2ca41da3269fd91d970388cd0d2667683",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0004",
    expectedUnitTestCount: 102,
    requiredTrueFields: [
      "governed_asset_ingestion_state_validation_passed",
      "focused_mkt_0004_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0003_foundation_regression_passed",
      "duplicate_binary_fail_closed_verified",
      "multiple_assets_per_product_verified",
      "blocked_product_asset_ingestion_separation_verified",
      "rendered_campaign_source_rejection_verified",
      "controlled_replacement_supersession_verified",
      "atomic_ingest_rollback_verified",
      "atomic_replace_rollback_verified",
      "historical_binary_retention_verified",
      "historical_binary_tamper_detection_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/assetctl.py",
    requiredTokens: [
      "validate",
      "ingest",
      "replace",
      "campaign_eligibility_evaluated",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;
export const HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0005-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0005 Governed Marketing Calendar Draft-Queue Intake and Creative Brief Routing",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0005-marketing-calendar-creative-brief-routing",
    repositoryHead:
      "84101da235923d86b72047bdaa7f5f0b9655568c",
    repositoryTree:
      "4af98551588bca90c2e0c9833badc18130e2d59b",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "schemas/creative-brief.schema.json",
    "schemas/marketing-calendar-task.schema.json",
    "scripts/briefctl.py",
    "tests/test_briefctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "schemas/creative-brief.schema.json",
      sha256: "35dec727dc48b95d5afed4fbbd2241b1456fbc65a99a733f6f04642895b565e3",
    },
    {
      relativePath: "schemas/marketing-calendar-task.schema.json",
      sha256: "d7004c2d9917c6057f56ef89576ba8110e038a14ac21ea855b4328637a52b1fd",
    },
    {
      relativePath: "scripts/briefctl.py",
      sha256: "2e2c606ac65dcab261e76333d73d1312875e83b6a93522adf0d9ce9add1e22ee",
    },
    {
      relativePath: "tests/test_briefctl.py",
      sha256: "50be83957968f00d73b335e5f74068365033a92b456ded98a275931dbf0ab8fe",
    },
  ],
  validationEvidence: {
    relativePath: "evidence/external-projects/hanna-mkt-0005-repository-only.json",
    sha256: "e923b66d391ea194d2b2c71a33e3bb02a60959390c603cac10c4c9d666d924b1",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0005",
    expectedUnitTestCount: 122,
    requiredTrueFields: [
      "governed_marketing_calendar_brief_routing_validation_passed",
      "focused_mkt_0005_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0001_0004_regressions_passed",
      "marketing_calendar_task_schema_verified",
      "contradictory_approval_fail_closed_verified",
      "explicit_product_identity_binding_verified",
      "non_product_route_identity_separation_verified",
      "blocked_product_fail_closed_verified",
      "missing_asset_fail_closed_verified",
      "brand_guidelines_reference_only_verified",
      "external_generation_mutation_boundaries_disabled_verified",
      "deterministic_brief_hash_binding_verified",
      "materialization_no_final_creative_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/briefctl.py",
    requiredTokens: [
      "validate-task",
      "build",
      "validate-brief",
      "materialize",
      "product_identity_inference_allowed",
      "external_action_authorized",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;
export const HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0006-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0006 Governed AI Creative Draft Generation and Review-Ready Output",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0006-governed-ai-creative-draft-generation",
    repositoryHead:
      "693eaad47793e3ca5717f891158464eda322ca77",
    repositoryTree:
      "aa6fc586640900dd0c5b7810a6a2decfc157124b",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "requirements.txt",
    "schemas/creative-review-draft.schema.json",
    "scripts/draftctl.py",
    "tests/test_draftctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "requirements.txt",
      sha256: "1a0be5450883bd7b53676f9ef2be1d8d406e4cb8a4e521e3e58cd20f3bc9006a",
    },
    {
      relativePath: "schemas/creative-review-draft.schema.json",
      sha256: "2ce45f27145dee42bf782e480a456a339562dfda647e3468e4f255dbe4b83c30",
    },
    {
      relativePath: "scripts/draftctl.py",
      sha256: "e662d8a7b8fb67206c16f94492f56569fab571820118d2d7aa9578668631582c",
    },
    {
      relativePath: "tests/test_draftctl.py",
      sha256: "ae7bfa72333c7aa12f69ac8f70960d39a12c2cbd02618e06f8ac0943306fb8b4",
    },
  ],
  validationEvidence: {
    relativePath:
      "evidence/external-projects/hanna-mkt-0006-repository-only.json",
    sha256: "205fb5bc6e412901cca60b875708cf890d6794e79debb6eb9d2a7c7f26bec5a5",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0006",
    expectedUnitTestCount: 146,
    requiredTrueFields: [
      "governed_ai_creative_review_draft_generation_validation_passed",
      "focused_mkt_0006_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0001_0005_regressions_passed",
      "creative_review_draft_schema_verified",
      "exact_mkt_0005_brief_binding_verified",
      "existing_draft_fail_closed_verified",
      "draft_ready_regeneration_blocked_verified",
      "explicit_product_identity_binding_preserved_verified",
      "product_text_generation_without_visual_rendering_verified",
      "reference_only_source_claim_support_blocked_verified",
      "non_public_safe_generated_claim_blocked_verified",
      "deterministic_invocation_identity_verified",
      "structured_output_contract_verified",
      "provider_tools_disabled_verified",
      "provider_storage_disabled_verified",
      "provider_background_disabled_verified",
      "provider_automatic_retries_disabled_verified",
      "duplicate_materialization_provider_call_prevented_verified",
      "persisted_claim_source_support_revalidation_verified",
      "atomic_review_draft_materialization_verified",
      "review_draft_overwrite_blocked_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/draftctl.py",
    requiredTokens: [
      "generate",
      "validate",
      "materialize",
      "OpenAIResponsesProvider",
      "existing_marketing_calendar_draft_content_blocks_generation",
      "store=False",
      "background=False",
      "tools=[]",
      "max_retries=0",
      "publication_authorized",
      "external_action_authorized",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;
export const HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0007-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0007 Governed Marketing Calendar Review-Draft Writeback and Review Routing",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0007-governed-marketing-calendar-review-draft-writeback",
    repositoryHead:
      "938cd2bae20ef706f70ad15e5e8ce89a97d43743",
    repositoryTree:
      "76f984698be9730bc0d8432dcd1a5fd1d1877749",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "schemas/marketing-calendar-writeback-intent.schema.json",
    "schemas/marketing-calendar-writeback.schema.json",
    "scripts/writebackctl.py",
    "tests/test_writebackctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "schemas/marketing-calendar-writeback-intent.schema.json",
      sha256: "4ccb723ac23d5e90405181e7f488dfb9cbd3c9374447272247e28574946b0bd1",
    },
    {
      relativePath: "schemas/marketing-calendar-writeback.schema.json",
      sha256: "43c5296dbbf85f5e19c45a79276cb78104d9a5f1f10c4e672c6cf4e1e9597805",
    },
    {
      relativePath: "scripts/writebackctl.py",
      sha256: "b084839da8cc58417d9ef53625a280310b3875475932a2bfae4b2806910b5d12",
    },
    {
      relativePath: "tests/test_writebackctl.py",
      sha256: "206c2d3a7bb3d04191bccf8bec935804016637ae5a9fc829c520f6ae1fc543a8",
    },
  ],
  validationEvidence: {
    relativePath:
      "evidence/external-projects/hanna-mkt-0007-repository-only.json",
    sha256: "b97852cfb21a63d9ca19dc3e8b6ebdd810b8f2dcb8e09076e29e02569c13cfb7",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0007",
    expectedUnitTestCount: 173,
    requiredTrueFields: [
      "governed_marketing_calendar_review_draft_writeback_validation_passed",
      "focused_mkt_0007_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0001_0006_regressions_passed",
      "writeback_evidence_schema_verified",
      "writeback_intent_schema_verified",
      "exact_mkt_0005_record_binding_verified",
      "exact_mkt_0006_review_draft_binding_verified",
      "draft_needed_to_draft_ready_only_verified",
      "blocked_statuses_fail_closed_verified",
      "substantive_draft_collision_blocked_verified",
      "source_snapshot_drift_detection_verified",
      "concurrent_change_detection_verified",
      "deterministic_operation_identity_verified",
      "duplicate_repository_evidence_blocked_verified",
      "duplicate_external_state_detected_verified",
      "ambiguous_transport_reread_verified",
      "automatic_patch_retry_disabled_verified",
      "read_after_write_verified",
      "unrelated_property_mutation_detection_verified",
      "rich_text_chunking_without_truncation_verified",
      "notion_api_contract_and_secret_redaction_verified",
      "exact_record_authorization_verified",
      "prewrite_intent_persisted_before_external_mutation_verified",
      "verified_external_write_recovery_without_second_patch_verified",
      "pending_unapplied_intent_no_automatic_retry_verified",
      "ai_regeneration_forbidden_during_writeback_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/writebackctl.py",
    requiredTokens: [
      "preflight_writeback",
      "apply_writeback",
      "NotionRESTProvider",
      "NOTION_API_VERSION",
      "Draft Needed",
      "Draft Ready",
      "exact_target_record_authorization_required",
      "writeback_operation_already_applied",
      "writeback_intent_unapplied_no_automatic_retry",
      "notion_page_changed_during_prewrite_verification",
      "notion_write_transport_ambiguous_unapplied",
      "automatic_retry_performed",
      "read_after_write_verified",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;
export const HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0008-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0008 Governed Marketing Review Decision and Approval Boundary",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0008-governed-marketing-review-decision-approval-boundary",
    repositoryHead:
      "fb062179e432ad08648011dafc13cc628f21f68f",
    repositoryTree:
      "6fba368faacc6e916e0d9e25685ea72ec27c924a",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "schemas/marketing-review-approval-evidence.schema.json",
    "schemas/marketing-review-approval-intent.schema.json",
    "schemas/marketing-review-decision.schema.json",
    "scripts/reviewctl.py",
    "tests/test_reviewctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "schemas/marketing-review-approval-evidence.schema.json",
      sha256: "e212a8217758b12fb36a11ac98acccd28f0e2f07186f66c505742542f4c2ab36",
    },
    {
      relativePath: "schemas/marketing-review-approval-intent.schema.json",
      sha256: "d2d6ed502f997c1f1837aa8484de6ec52aece82f94ba89d9645476b7c3c764db",
    },
    {
      relativePath: "schemas/marketing-review-decision.schema.json",
      sha256: "2531ab2810a52ae8c6827da98f9e6b4ab0cd4f39633b6e89a394283c5bed7cd2",
    },
    {
      relativePath: "scripts/reviewctl.py",
      sha256: "150f287feb2c6e1da3700b9479a5c4d68f2088e77b939b3f8c6cd677a04e9d2f",
    },
    {
      relativePath: "tests/test_reviewctl.py",
      sha256: "d131c89f9a63e5c838395e285505ff3c07c9d51a22d029069e25034db39177ad",
    },
  ],
  validationEvidence: {
    relativePath:
      "evidence/external-projects/hanna-mkt-0008-repository-only.json",
    sha256: "aa29adc5ef2dbf7606a3a376d45fd5f0dafb4aa117b4e913e98bcbe9bbcd323f",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0008",
    expectedUnitTestCount: 198,
    requiredTrueFields: [
      "governed_marketing_review_decision_approval_boundary_validation_passed",
      "focused_mkt_0008_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0001_0007_regressions_passed",
      "review_decision_schema_verified",
      "approval_intent_schema_verified",
      "approval_evidence_schema_verified",
      "exact_mkt_0005_brief_binding_verified",
      "exact_mkt_0006_review_draft_binding_verified",
      "exact_mkt_0007_writeback_binding_verified",
      "authorized_reviewer_binding_verified",
      "approve_reject_revise_decisions_verified",
      "reject_revise_no_external_mutation_verified",
      "unsafe_claim_blocks_approve_verified",
      "deterministic_decision_identity_verified",
      "immutable_decision_no_overwrite_verified",
      "rehashed_writeback_tamper_fail_closed_verified",
      "draft_ready_and_approved_false_prerequisite_verified",
      "prewrite_intent_persisted_before_approval_mutation_verified",
      "prewrite_drift_detection_verified",
      "ambiguous_transport_reread_verified",
      "conflict_409_reconciliation_verified",
      "automatic_patch_retry_disabled_verified",
      "pending_intent_recovery_without_second_patch_verified",
      "pending_unapplied_intent_no_automatic_retry_verified",
      "read_after_write_verified",
      "unrelated_property_mutation_detection_verified",
      "exact_status_approved_property_scope_verified",
      "real_rest_adapter_scope_verified",
      "publication_external_action_separation_verified",
      "secret_scan_passed",
      "live_smoke_blocked_no_exact_safe_target_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/reviewctl.py",
    requiredTokens: [
      "preflight",
      "record",
      "preflight-approval",
      "apply-approval",
      "ApprovalNotionRESTProvider",
      "prepare_approval_transition",
      "preflight_approval_transition",
      "apply_approval_transition",
      "Draft Ready",
      "Approved",
      "approval_property_scope_invalid",
      "approval_intent_unapplied_no_automatic_retry",
      "approval_write_transport_ambiguous_unapplied",
      "automatic_retry_performed",
      "read_after_write_verified",
      "publication_authorized",
      "external_action_authorized",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;
export const HANNA_MKT_0009_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0009-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0009 Governed Approved Creative Render Authorization and Final Campaign Package",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0009-governed-approved-creative-render-authorization-final-campaign-package",
    repositoryHead:
      "0eba50ba77e5c98b0baa901507f0f0a4b1dd9a69",
    repositoryTree:
      "8be192be3ead4bbedf5b03a285f8106b0dfbe363",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "schemas/creative-render-authorization.schema.json",
    "schemas/final-campaign-package.schema.json",
    "scripts/render_carousel.py",
    "scripts/renderctl.py",
    "tests/test_renderctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "schemas/creative-render-authorization.schema.json",
      sha256: "3ce2a838934538ce43e0a7f929be12a66ba6daae05e26ca162e81458872895ae",
    },
    {
      relativePath: "schemas/final-campaign-package.schema.json",
      sha256: "6cb9e3c7bb459a921fb2b984b37266394f509b91080147a6e759915fc9288dd6",
    },
    {
      relativePath: "scripts/render_carousel.py",
      sha256: "b387a11e1b6157c4f051f25e87ec7f87505463f22ea2e5cee5aae6cecebc1eee",
    },
    {
      relativePath: "scripts/renderctl.py",
      sha256: "0e88990b89e7fea97097555e12a0b69203dfc357ab68276a85201c481f0eda1b",
    },
    {
      relativePath: "tests/test_renderctl.py",
      sha256: "64a1480667fd22edfb3df007df02283c0c2710e9f1c4ee96128b1e2f3a3f86f8",
    },
  ],
  validationEvidence: {
    relativePath:
      "evidence/external-projects/hanna-mkt-0009-repository-only.json",
    sha256: "c31852b97d0e6a8be14298c4854e9c93bdc1233fed2ec511344d583a7a3cb528",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0009",
    expectedUnitTestCount: 215,
    requiredTrueFields: [
      "governed_approved_creative_render_authorization_final_package_validation_passed",
      "focused_mkt_0009_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0001_0008_regressions_passed",
      "render_authorization_schema_verified",
      "final_campaign_package_schema_verified",
      "exact_mkt_0008_approval_binding_verified",
      "separate_render_authorization_boundary_verified",
      "mkt0008_creative_rendering_false_boundary_preserved_verified",
      "deterministic_render_operation_identity_verified",
      "immutable_render_authorization_no_overwrite_verified",
      "canonical_product_asset_binding_verified",
      "missing_canonical_product_asset_fails_closed_verified",
      "historical_rendered_slide_forbidden_as_product_asset_verified",
      "product_asset_drift_fail_closed_verified",
      "deterministic_rendered_artifact_hashes_verified",
      "rendered_artifact_sha256_verification_verified",
      "immutable_final_campaign_package_no_overwrite_verified",
      "final_package_identity_hash_verified",
      "final_package_read_after_write_verified",
      "direct_legacy_renderer_cli_disabled_verified",
      "destructive_render_overwrite_disabled_verified",
      "rerender_new_governed_identity_verified",
      "publication_external_action_separation_verified",
      "committed_source_secret_scan_passed",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/renderctl.py",
    requiredTokens: [
      "authorize",
      "render",
      "build_render_authorization",
      "materialize_render_authorization",
      "materialize_final_package",
      "validate_final_package_document",
      "validate_mkt0008_approved_chain",
      "creative_rendering_authorized",
      "missing_verified_product_assets",
      "historical_rendered_slide_forbidden_as_product_asset",
      "render_authorization_not_canonical_materialized_path",
      "read_after_write_verified",
      "publication_authorized",
      "external_action_authorized",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;
export const HANNA_MKT_0010_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0010-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0010 Hanna Marketing Control Center and Governed Notion Campaign Operations",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0010-hanna-marketing-control-center-governed-notion-campaign-operations",
    repositoryHead:
      "8355d5e9a70e6ee4676975abf5a28cbd81dcdac3",
    repositoryTree:
      "45b2111d719618b3b67e649d43fa1fa15464e8e9",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "control_center/__init__.py",
    "control_center/app.py",
    "control_center/artifacts.py",
    "control_center/operations.py",
    "control_center/repository.py",
    "control_center/templates/control_center/index.html",
    "requirements.txt",
    "tests/test_control_center.py",
  ],
  requiredFiles: [
    {
      relativePath: "control_center/__init__.py",
      sha256: "9666437c658914d7adff70a92660f2d08b7ab962575081253af72e5691be76d0",
    },
    {
      relativePath: "control_center/app.py",
      sha256: "bd26d0a934c253dc1dcbcaa16ca4120e4f160b5c7fcb71906cfb2720a1a84352",
    },
    {
      relativePath: "control_center/artifacts.py",
      sha256: "ff12b7aa7fe9e02288bb249e49428dce88ac4c902584194b84b2e866ab1fd502",
    },
    {
      relativePath: "control_center/operations.py",
      sha256: "caf30aadc97139c739918ee8c3059f50d320425fe2da89998174db9320aa025d",
    },
    {
      relativePath: "control_center/repository.py",
      sha256: "033051487631b4e7861f7b6cf3837740317e35b564b44c6e8f13b523b51de965",
    },
    {
      relativePath: "control_center/templates/control_center/index.html",
      sha256: "b9cad59fc747e99e75dc56d0bf549ed1e9e5c053bc4281ff237ad58530212198",
    },
    {
      relativePath: "requirements.txt",
      sha256: "058372df3c0118a2b205599522dfbf03d8701d63332561eddc85bcac334e7c68",
    },
    {
      relativePath: "tests/test_control_center.py",
      sha256: "a1e3f58e2cf355c443d1353990d16208de1e338c2c2aed040b21f5b65d44098a",
    },
  ],
  validationEvidence: {
    relativePath: "evidence/external-projects/hanna-mkt-0010-repository-only.json",
    sha256: "634b5efbc6364b51ef6c0f01e1cf063f42b0c285a64f76b5e40e28fa153cdaa2",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0010",
    expectedUnitTestCount: 226,
    requiredTrueFields: [
      "governed_hanna_marketing_control_center_validation_passed",
      "focused_mkt_0010_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0001_0009_regressions_passed",
      "repository_only_no_product_database_verified",
      "canonical_repository_visibility_verified",
      "schema_validated_artifact_visibility_verified",
      "governed_artifact_family_coverage_verified",
      "active_asset_visibility_binding_verified",
      "operation_readiness_fail_closed_verified",
      "notion_mutation_controls_not_exposed_verified",
      "notion_credential_value_not_exposed_verified",
      "lifecycle_state_inference_disabled_verified",
      "approval_render_publication_boundary_verified",
      "publish_date_not_scheduling_proof_verified",
      "control_center_dashboard_smoke_passed",
      "control_center_health_smoke_passed",
      "committed_source_secret_scan_passed",
      "exact_hanna_remote_commit_verified",
      "exact_hanna_remote_tree_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "control_center/app.py",
    requiredTokens: [
      "create_app",
      "read_dashboard_state",
      "read_operation_readiness",
      "repository_only_no_product_database",
    ],
  },
  uiContract: {
    relativePath: "control_center/templates/control_center/index.html",
    requiredTokens: [
      "Governed persisted artifacts",
      "Governed campaign operation readiness",
      "Live mutation controls exposed:",
      "Lifecycle state is not inferred",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;

export const HANNA_MKT_0011_REPOSITORY_ONLY_PROFILE = {
  profileKey: "hanna-marketing-hanna-mkt-0011-repository-only",
  packetIdentity: {
    project_key: "hanna-commerce-os",
    module_key: "agent-workflows",
    build_session_title:
      "HANNA-MKT-0011 Governed Hermes Unattended Competitive and Market Research Operator",
  },
  target: {
    repositoryRemote:
      "https://github.com/wesleykoki2002-hue/hanna-social-operator.git",
    repositoryBranch:
      "feature/hanna-mkt-0011-governed-hermes-unattended-competitive-and-market-research-operator",
    repositoryHead:
      "368a3bfb361d5bf4d347475807ee568ea6338922",
    repositoryTree:
      "ea9aa608eaecd2a2e33191a0e8bf9be3cb6221ef",
    repositoryPathEnvironment:
      "ATHENA_HANNA_SOCIAL_OPERATOR_REPOSITORY_PATH",
    repositoryPathFallbacks: [
      "C:\\supabase\\hanna-social-operator",
      "/mnt/c/supabase/hanna-social-operator",
    ],
  },
  expectedChangedFiles: [
    "control_center/repository.py",
    "control_center/templates/control_center/index.html",
    "prompts/RUN_GOVERNED_RESEARCH_PROMPT.md",
    "schemas/research-run.schema.json",
    "scripts/hermes_research_cronctl.py",
    "scripts/researchctl.py",
    "tests/test_hermes_research_cronctl.py",
    "tests/test_research_control_center.py",
    "tests/test_researchctl.py",
  ],
  requiredFiles: [
    {
      relativePath: "control_center/repository.py",
      sha256: "2713ed24598a41904284f4d5d05868ba8aa1fb761d75755a407d457e81898bfd",
    },
    {
      relativePath: "control_center/templates/control_center/index.html",
      sha256: "f311376e900e0180dd88f11af9c1c44e0d9daa2e32a571053b732764ad655c40",
    },
    {
      relativePath: "prompts/RUN_GOVERNED_RESEARCH_PROMPT.md",
      sha256: "3446158e07826889991e77ba2decd9873a86daa429829e8b714c888c660cd703",
    },
    {
      relativePath: "schemas/research-run.schema.json",
      sha256: "937159da79ea06f3ef39099ec159bb8ce02ddf5edc3ccdab93ed708f07263d06",
    },
    {
      relativePath: "scripts/hermes_research_cronctl.py",
      sha256: "2180285ab0fdd2a08b24a1ccee5f75713a0a4f865e285e661826af1d41f28ac0",
    },
    {
      relativePath: "scripts/researchctl.py",
      sha256: "67b654bfe8172f581f86c350d6c6d3a3672d7534990ee0954e83fe69eacd1890",
    },
    {
      relativePath: "tests/test_hermes_research_cronctl.py",
      sha256: "4691e78f9f8714222a147d0a16839a2299847b1d427ec5b23786e6b33a310ca2",
    },
    {
      relativePath: "tests/test_research_control_center.py",
      sha256: "241dfb4e1c62a0c8f65150903e15d83a8f6f56132452a452e92de6fa61215c05",
    },
    {
      relativePath: "tests/test_researchctl.py",
      sha256: "97b07de6ddf16ed838ee9a462b51740e39d62bff589db23170b65d851636e7d2",
    },
  ],
  validationEvidence: {
    relativePath: "evidence/external-projects/hanna-mkt-0011-repository-only.json",
    sha256: "a9051751e82a675873187276e737169267885419005804cc4947a4106c7d52a1",
    evidenceVersion: "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0011",
    expectedUnitTestCount: 273,
    requiredTrueFields: [
      "governed_unattended_research_operator_validation_passed",
      "focused_mkt_0011_tests_passed",
      "complete_regression_suite_passed",
      "existing_mkt_0001_0010_regressions_passed",
      "repository_only_no_product_database_verified",
      "deterministic_research_plan_verified",
      "enabled_competitor_fail_closed_verified",
      "research_run_identity_deduplication_verified",
      "race_safe_no_overwrite_verified",
      "persisted_provenance_revalidation_verified",
      "bounded_retry_failure_states_verified",
      "control_center_research_visibility_verified",
      "research_authority_boundaries_verified",
      "exact_cron_job_id_binding_verified",
      "hermes_profile_gateway_running_verified",
      "governed_production_cron_installed_verified",
      "exactly_one_profile_scoped_cron_verified",
      "cron_schedule_workdir_delivery_verified",
      "source_git_unchanged_during_runtime_activation_verified",
      "hermes_research_not_executed_during_activation_verified",
      "committed_source_secret_scan_passed",
      "exact_hanna_remote_commit_verified",
      "exact_hanna_remote_tree_verified",
    ],
    resolveCalculationFromValidation: true,
  },
  callableContract: {
    relativePath: "scripts/researchctl.py",
    requiredTokens: [
      "build_plan",
      "candidate_template",
      "validate_candidate",
      "materialize_run",
      "read_repository_state",
      "AUTHORITY_BOUNDARIES",
      "no_enabled_competitors",
    ],
  },
  uiContract: {
    relativePath: "control_center/templates/control_center/index.html",
    requiredTokens: [
      "Unattended research operator",
      "Enabled competitors",
      "Research runs",
      "Research evidence and recommendations do not authorize creative",
      "Notion writeback",
      "Shopify mutation",
      "BeautyDNA mutation",
      "customer messaging",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;

const EXTERNAL_PROJECT_REPOSITORY_ONLY_PROFILES: readonly ExternalProjectRepositoryOnlyProfile[] = [
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0008_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0009_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0010_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0011_REPOSITORY_ONLY_PROFILE,
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
