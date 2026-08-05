import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  ExternalProjectCompletionProfile,
} from "./external-project-completion-profile";

const execFileAsync = promisify(execFile);

const GIT_OBJECT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const SECURITY_TOKENS = [
  "enable row level security",
  "create policy",
  "alter policy",
  "drop policy",
  "grant ",
  "revoke ",
  "security definer",
  "set search_path",
] as const;

export type ExternalProjectMigrationEvidence = {
  relativePath: string;
  sha256: string;
  securityTokenCounts: Record<string, number>;
};

export type ExternalProjectRepositoryEvidence = {
  repositoryPath: string;
  repositoryRemote: string;
  repositoryBranch: string;
  repositoryHead: string;
  repositoryTree: string;
  linkedSupabaseProjectRef: string;
  trackedDiffEmpty: true;
  stagedDiffEmpty: true;
  migrations: ExternalProjectMigrationEvidence[];
  repositoryEvidenceSha256: string;
};

function requiredEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(
      `Required external-project environment setting is missing: ${name}`,
    );
  }

  return value;
}

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);

  return process.platform === "win32"
    ? resolved.toLowerCase()
    : resolved;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

async function runGit(
  repositoryPath: string,
  argumentsList: string[],
): Promise<string> {
  const result = await execFileAsync(
    "git",
    [
      "-C",
      repositoryPath,
      ...argumentsList,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return result.stdout.trim();
}

function safeMigrationPath(
  repositoryPath: string,
  relativePath: string,
): string {
  const normalized =
    relativePath.replace(/\\/g, "/");

  if (
    !normalized.startsWith(
      "supabase/migrations/",
    ) ||
    path.posix.isAbsolute(normalized) ||
    normalized
      .split("/")
      .includes("..")
  ) {
    throw new Error(
      `External-project migration path is outside the approved scope: ${relativePath}`,
    );
  }

  const resolved = path.resolve(
    repositoryPath,
    ...normalized.split("/"),
  );

  const migrationRoot = path.resolve(
    repositoryPath,
    "supabase",
    "migrations",
  );

  const rootWithSeparator =
    migrationRoot.endsWith(path.sep)
      ? migrationRoot
      : `${migrationRoot}${path.sep}`;

  if (
    resolved === migrationRoot ||
    !normalizedPath(resolved).startsWith(
      normalizedPath(rootWithSeparator),
    )
  ) {
    throw new Error(
      `External-project migration path escaped its repository: ${relativePath}`,
    );
  }

  return resolved;
}

function countToken(
  content: string,
  token: string,
): number {
  let count = 0;
  let searchFrom = 0;

  while (true) {
    const index = content.indexOf(
      token,
      searchFrom,
    );

    if (index < 0) {
      return count;
    }

    count += 1;
    searchFrom = index + token.length;
  }
}

function securityTokenCounts(
  content: string,
): Record<string, number> {
  const normalized = content.toLowerCase();

  return Object.fromEntries(
    SECURITY_TOKENS.map((token) => [
      token,
      countToken(normalized, token),
    ]),
  );
}

function validateProfileIdentity(
  profile: ExternalProjectCompletionProfile,
) {
  if (
    !GIT_OBJECT_PATTERN.test(
      profile.target.repositoryHead,
    )
  ) {
    throw new Error(
      "The external-project profile repository HEAD is invalid.",
    );
  }

  for (const migration of profile.migrations) {
    if (!SHA256_PATTERN.test(migration.sha256)) {
      throw new Error(
        `The expected migration SHA-256 is invalid: ${migration.relativePath}`,
      );
    }
  }
}

export async function
verifyExternalProjectRepositoryEvidence(
  profile: ExternalProjectCompletionProfile,
  environment: NodeJS.ProcessEnv =
    process.env,
): Promise<ExternalProjectRepositoryEvidence> {
  validateProfileIdentity(profile);

  const repositoryPath = path.resolve(
    requiredEnvironment(
      environment,
      profile.target
        .repositoryPathEnvironment,
    ),
  );

  const configuredProjectRef =
    requiredEnvironment(
      environment,
      profile.target
        .supabaseProjectRefEnvironment,
    );

  if (
    configuredProjectRef !==
    profile.target.supabaseProjectRef
  ) {
    throw new Error(
      "Configured external-project Supabase identity does not match the governed profile.",
    );
  }

  const topLevel = path.resolve(
    await runGit(
      repositoryPath,
      [
        "rev-parse",
        "--show-toplevel",
      ],
    ),
  );

  if (
    normalizedPath(topLevel) !==
    normalizedPath(repositoryPath)
  ) {
    throw new Error(
      `External-project repository root mismatch. Expected ${repositoryPath}; found ${topLevel}.`,
    );
  }

  const [
    repositoryRemote,
    repositoryBranch,
    repositoryHead,
    repositoryTree,
    trackedDiff,
    stagedDiff,
    trackedIndex,
  ] = await Promise.all([
    runGit(
      repositoryPath,
      [
        "remote",
        "get-url",
        "origin",
      ],
    ),
    runGit(
      repositoryPath,
      [
        "branch",
        "--show-current",
      ],
    ),
    runGit(
      repositoryPath,
      [
        "rev-parse",
        "HEAD",
      ],
    ),
    runGit(
      repositoryPath,
      [
        "rev-parse",
        "HEAD^{tree}",
      ],
    ),
    runGit(
      repositoryPath,
      [
        "diff",
        "--no-ext-diff",
        "--name-only",
        "--",
        ".",
      ],
    ),
    runGit(
      repositoryPath,
      [
        "diff",
        "--cached",
        "--no-ext-diff",
        "--name-only",
        "--",
        ".",
      ],
    ),
    runGit(
      repositoryPath,
      [
        "ls-files",
        "-s",
      ],
    ),
  ]);

  const normalizedHead =
    repositoryHead.toLowerCase();

  const normalizedTree =
    repositoryTree.toLowerCase();

  if (
    repositoryRemote !==
    profile.target.repositoryRemote
  ) {
    throw new Error(
      "External-project repository remote does not match the governed profile.",
    );
  }

  if (
    repositoryBranch !==
    profile.target.repositoryBranch
  ) {
    throw new Error(
      "External-project repository branch does not match the governed profile.",
    );
  }

  if (
    normalizedHead !==
    profile.target.repositoryHead
  ) {
    throw new Error(
      "External-project repository HEAD does not match the governed profile.",
    );
  }

  if (
    !GIT_OBJECT_PATTERN.test(normalizedTree)
  ) {
    throw new Error(
      "External-project repository tree identity is invalid.",
    );
  }

  if (trackedDiff) {
    throw new Error(
      "Tracked external-project repository changes exist.",
    );
  }

  if (stagedDiff) {
    throw new Error(
      "Staged external-project repository changes exist.",
    );
  }

  if (!trackedIndex) {
    throw new Error(
      "External-project repository has no tracked-file evidence.",
    );
  }

  const linkedProjectRef = (
    await readFile(
      path.join(
        repositoryPath,
        "supabase",
        ".temp",
        "project-ref",
      ),
      "utf8",
    )
  ).trim();

  if (
    linkedProjectRef !==
    profile.target.supabaseProjectRef
  ) {
    throw new Error(
      "External-project repository is linked to the wrong Supabase project.",
    );
  }

  const migrations =
    await Promise.all(
      profile.migrations.map(
        async (migration) => {
          const migrationPath =
            safeMigrationPath(
              repositoryPath,
              migration.relativePath,
            );

          const bytes =
            await readFile(migrationPath);

          const actualSha256 =
            sha256(bytes);

          if (
            actualSha256 !==
            migration.sha256
          ) {
            throw new Error(
              `External-project migration SHA-256 mismatch: ${migration.relativePath}`,
            );
          }

          return {
            relativePath:
              migration.relativePath,
            sha256: actualSha256,
            securityTokenCounts:
              securityTokenCounts(
                bytes.toString("utf8"),
              ),
          };
        },
      ),
    );

  const repositoryEvidenceSha256 =
    sha256(
      JSON.stringify({
        repositoryPath:
          normalizedPath(repositoryPath),
        repositoryRemote,
        repositoryBranch,
        repositoryHead:
          normalizedHead,
        repositoryTree:
          normalizedTree,
        linkedSupabaseProjectRef:
          linkedProjectRef,
        trackedIndex,
        migrations,
      }),
    );

  return {
    repositoryPath,
    repositoryRemote,
    repositoryBranch,
    repositoryHead:
      normalizedHead,
    repositoryTree:
      normalizedTree,
    linkedSupabaseProjectRef:
      linkedProjectRef,
    trackedDiffEmpty: true,
    stagedDiffEmpty: true,
    migrations,
    repositoryEvidenceSha256,
  };
}