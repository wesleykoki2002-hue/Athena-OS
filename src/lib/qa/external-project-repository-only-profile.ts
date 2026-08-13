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
const EXTERNAL_PROJECT_REPOSITORY_ONLY_PROFILES: readonly ExternalProjectRepositoryOnlyProfile[] = [
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0002_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0003_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0004_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0005_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0006_REPOSITORY_ONLY_PROFILE,
  HANNA_MKT_0007_REPOSITORY_ONLY_PROFILE,
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
