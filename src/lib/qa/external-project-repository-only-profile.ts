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
      relativePath:
        "schemas/campaign-package.schema.json",
      sha256:
        "e8174647c193fe51a64ec077a03b33632025df0b6eb290cdee26131eee1cf255",
    },
    {
      relativePath:
        "scripts/campaignctl.py",
      sha256:
        "8d1f1b3ad3ebb74efa38f519bbbd78a17ae0cc0547b211d7a00f4deea94c1649",
    },
    {
      relativePath:
        "tests/test_campaign_schema.py",
      sha256:
        "737c9589808ef8a47f9285d1bbc857a30e4e44f37c067b041307d0e7a8e1c50c",
    },
    {
      relativePath:
        "tests/test_campaignctl.py",
      sha256:
        "568d2decaa1ada64c9efb62ffb55d220a5a8f109e7c203fd47f22c763ed28820",
    },
  ],
  validationEvidence: {
    relativePath:
      "evidence/external-projects/hanna-mkt-0001-repository-only.json",
    sha256:
      "75f2fd9465cf4b92062ae1d5ff55da616c48bff9fb4e31cd87463b582ff42000",
    evidenceVersion:
      "athena-external-project-repository-only-v1",
    buildId: "HANNA-MKT-0001",
    expectedUnitTestCount: 32,
  },
  callableContract: {
    relativePath: "scripts/campaignctl.py",
    requiredTokens: [
      "check-approval",
      "approve",
      "validate",
    ],
  },
} as const satisfies ExternalProjectRepositoryOnlyProfile;

const EXTERNAL_PROJECT_REPOSITORY_ONLY_PROFILES: readonly ExternalProjectRepositoryOnlyProfile[] = [
  HANNA_MKT_0001_REPOSITORY_ONLY_PROFILE,
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
