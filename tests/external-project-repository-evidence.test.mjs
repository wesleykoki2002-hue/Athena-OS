import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import {
  verifyExternalProjectRepositoryEvidence,
} from "../src/lib/qa/external-project-repository-evidence.ts";

const execFileAsync = promisify(execFile);

function sha256(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

async function runGit(repositoryPath, args) {
  const result = await execFileAsync(
    "git",
    args,
    {
      cwd: repositoryPath,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  return result.stdout.trim();
}

async function createFixture() {
  const repositoryPath = await mkdtemp(
    path.join(
      os.tmpdir(),
      "athena-external-project-repo-",
    ),
  );

  const migrationRelativePath =
    "supabase/migrations/20260804124900_fixture.sql";

  const migrationPath = path.join(
    repositoryPath,
    ...migrationRelativePath.split("/"),
  );

  const projectRefPath = path.join(
    repositoryPath,
    "supabase",
    ".temp",
    "project-ref",
  );

  const migrationContent = [
    "begin;",
    "select 1;",
    "commit;",
    "",
  ].join("\n");

  await runGit(
    repositoryPath,
    [
      "init",
      "-b",
      "governed-branch",
    ],
  );

  await runGit(
    repositoryPath,
    [
      "config",
      "user.name",
      "Athena Test",
    ],
  );

  await runGit(
    repositoryPath,
    [
      "config",
      "user.email",
      "athena-test@example.invalid",
    ],
  );

  await mkdir(
    path.dirname(migrationPath),
    {
      recursive: true,
    },
  );

  await writeFile(
    migrationPath,
    migrationContent,
    "utf8",
  );

  await writeFile(
    path.join(repositoryPath, "README.md"),
    "fixture\n",
    "utf8",
  );

  await runGit(
    repositoryPath,
    [
      "add",
      ".",
    ],
  );

  await runGit(
    repositoryPath,
    [
      "commit",
      "-m",
      "fixture",
    ],
  );

  await runGit(
    repositoryPath,
    [
      "remote",
      "add",
      "origin",
      "https://example.invalid/beauty-os.git",
    ],
  );

  await mkdir(
    path.dirname(projectRefPath),
    {
      recursive: true,
    },
  );

  await writeFile(
    projectRefPath,
    "fixture-project-ref\n",
    "utf8",
  );

  const repositoryHead =
    await runGit(
      repositoryPath,
      [
        "rev-parse",
        "HEAD",
      ],
    );

  const profile = {
    profileKey: "fixture-profile",
    packetIdentity: {
      id:
        "00000000-0000-0000-0000-000000000001",
      project_key: "fixture",
      module_key: "fixture-module",
      build_session_title:
        "Fixture build",
    },
    target: {
      supabaseProjectRef:
        "fixture-project-ref",
      repositoryRemote:
        "https://example.invalid/beauty-os.git",
      repositoryBranch:
        "governed-branch",
      repositoryHead,
      repositoryPathEnvironment:
        "FIXTURE_REPOSITORY_PATH",
      supabaseUrlEnvironment:
        "FIXTURE_SUPABASE_URL",
      supabaseServiceRoleKeyEnvironment:
        "FIXTURE_SERVICE_ROLE_KEY",
      supabaseProjectRefEnvironment:
        "FIXTURE_PROJECT_REF",
    },
    migrations: [
      {
        relativePath:
          migrationRelativePath,
        sha256:
          sha256(
            Buffer.from(
              migrationContent,
              "utf8",
            ),
          ),
      },
    ],
    expectedMetrics: {
      launchProducts: 0,
      ingredientOccurrences: 0,
      matchedOccurrences: 0,
      governedUnmatchedOccurrences: 0,
      coveragePercent: 0,
      openQueueRows: 0,
      inReviewQueueRows: 0,
      remainingParabenHolds: 0,
      genericAliasRows: 0,
      compatibilityRuleRows: 0,
      legacyMatchRows: 0,
      finalProductSpecificSeeds: 0,
      verifiedMappingRows: 0,
      verifiedHoldRows: 0,
      finalMigrationHistoryRows: 0,
    },
    mappings: [],
    holds: [],
  };

  const environment = {
    FIXTURE_REPOSITORY_PATH:
      repositoryPath,
    FIXTURE_PROJECT_REF:
      "fixture-project-ref",
  };

  return {
    repositoryPath,
    migrationPath,
    migrationRelativePath,
    profile,
    environment,
  };
}

async function withFixture(callback) {
  const fixture =
    await createFixture();

  try {
    await callback(fixture);
  } finally {
    await rm(
      fixture.repositoryPath,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

test(
  "verifies exact repository and migration evidence",
  async () => {
    await withFixture(
      async ({
        profile,
        environment,
      }) => {
        const evidence =
          await verifyExternalProjectRepositoryEvidence(
            profile,
            environment,
          );

        assert.equal(
          evidence.repositoryRemote,
          profile.target
            .repositoryRemote,
        );

        assert.equal(
          evidence.repositoryBranch,
          profile.target
            .repositoryBranch,
        );

        assert.equal(
          evidence.repositoryHead,
          profile.target
            .repositoryHead,
        );

        assert.equal(
          evidence.linkedSupabaseProjectRef,
          profile.target
            .supabaseProjectRef,
        );

        assert.equal(
          evidence.migrations.length,
          1,
        );

        assert.deepEqual(
          evidence.migrations[0]
            .securityTokenCounts,
          {
            "enable row level security": 0,
            "create policy": 0,
            "alter policy": 0,
            "drop policy": 0,
            "grant ": 0,
            "revoke ": 0,
            "security definer": 0,
            "set search_path": 0,
          },
        );

        assert.match(
          evidence.repositoryEvidenceSha256,
          /^[0-9a-f]{64}$/,
        );
      },
    );
  },
);

test(
  "fails when repository configuration is missing",
  async () => {
    await withFixture(
      async ({ profile }) => {
        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            profile,
            {},
          ),
          /FIXTURE_REPOSITORY_PATH/,
        );
      },
    );
  },
);

test(
  "fails when configured project identity is wrong",
  async () => {
    await withFixture(
      async ({
        profile,
        environment,
      }) => {
        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            profile,
            {
              ...environment,
              FIXTURE_PROJECT_REF:
                "wrong-project",
            },
          ),
          /Supabase identity/,
        );
      },
    );
  },
);

test(
  "fails when governed remote is wrong",
  async () => {
    await withFixture(
      async ({
        profile,
        environment,
      }) => {
        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            {
              ...profile,
              target: {
                ...profile.target,
                repositoryRemote:
                  "https://example.invalid/wrong.git",
              },
            },
            environment,
          ),
          /remote/,
        );
      },
    );
  },
);

test(
  "fails when governed branch is wrong",
  async () => {
    await withFixture(
      async ({
        profile,
        environment,
      }) => {
        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            {
              ...profile,
              target: {
                ...profile.target,
                repositoryBranch:
                  "wrong-branch",
              },
            },
            environment,
          ),
          /branch/,
        );
      },
    );
  },
);

test(
  "fails when governed HEAD is wrong",
  async () => {
    await withFixture(
      async ({
        profile,
        environment,
      }) => {
        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            {
              ...profile,
              target: {
                ...profile.target,
                repositoryHead:
                  "0000000000000000000000000000000000000000",
              },
            },
            environment,
          ),
          /HEAD/,
        );
      },
    );
  },
);

test(
  "fails when tracked repository changes exist",
  async () => {
    await withFixture(
      async ({
        repositoryPath,
        profile,
        environment,
      }) => {
        await writeFile(
          path.join(
            repositoryPath,
            "README.md",
          ),
          "changed\n",
          "utf8",
        );

        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            profile,
            environment,
          ),
          /Tracked/,
        );
      },
    );
  },
);

test(
  "fails when staged repository changes exist",
  async () => {
    await withFixture(
      async ({
        repositoryPath,
        profile,
        environment,
      }) => {
        const stagedPath = path.join(
          repositoryPath,
          "staged.txt",
        );

        await writeFile(
          stagedPath,
          "staged\n",
          "utf8",
        );

        await runGit(
          repositoryPath,
          [
            "add",
            "staged.txt",
          ],
        );

        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            profile,
            environment,
          ),
          /Staged/,
        );
      },
    );
  },
);

test(
  "fails when a migration hash is wrong",
  async () => {
    await withFixture(
      async ({
        profile,
        environment,
      }) => {
        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            {
              ...profile,
              migrations: [
                {
                  ...profile.migrations[0],
                  sha256:
                    "0000000000000000000000000000000000000000000000000000000000000000",
                },
              ],
            },
            environment,
          ),
          /SHA-256 mismatch/,
        );
      },
    );
  },
);

test(
  "fails when migration path escapes the approved root",
  async () => {
    await withFixture(
      async ({
        profile,
        environment,
      }) => {
        await assert.rejects(
          verifyExternalProjectRepositoryEvidence(
            {
              ...profile,
              migrations: [
                {
                  relativePath:
                    "../outside.sql",
                  sha256:
                    profile.migrations[0]
                      .sha256,
                },
              ],
            },
            environment,
          ),
          /outside the approved scope/,
        );
      },
    );
  },
);

test(
  "migration fixture remains unchanged by verification",
  async () => {
    await withFixture(
      async ({
        migrationPath,
        profile,
        environment,
      }) => {
        const before =
          await readFile(migrationPath);

        await verifyExternalProjectRepositoryEvidence(
          profile,
          environment,
        );

        const after =
          await readFile(migrationPath);

        assert.deepEqual(after, before);
      },
    );
  },
);