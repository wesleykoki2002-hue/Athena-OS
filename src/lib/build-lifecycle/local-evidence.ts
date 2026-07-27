import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import type {
  CanonicalBuildLifecycleLocalEvidence,
} from "@/lib/build-lifecycle/types";

const execFileAsync = promisify(execFile);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_HEAD_PATTERN = /^[0-9a-f]{40}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Required lifecycle environment setting is missing: ${name}`);
  }

  return value;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function runGit(
  repositoryPath: string,
  argumentsList: string[],
): Promise<string> {
  const result = await execFileAsync(
    "git",
    ["-C", repositoryPath, ...argumentsList],
    {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return result.stdout.trim();
}

export async function verifyCanonicalBuildLifecycleLocalEvidence():
  Promise<CanonicalBuildLifecycleLocalEvidence> {
  const repositoryPath = path.resolve(
    requiredEnvironment("ATHENA_CANONICAL_REPOSITORY_PATH"),
  );
  const expectedRepositoryHead = requiredEnvironment(
    "ATHENA_CANONICAL_REPOSITORY_HEAD",
  ).toLowerCase();
  const handoffPath = path.resolve(
    requiredEnvironment("ATHENA_CANONICAL_HANDOFF_PATH"),
  );
  const handoffVersion = requiredEnvironment(
    "ATHENA_CANONICAL_HANDOFF_VERSION",
  );
  const expectedHandoffSha256 = requiredEnvironment(
    "ATHENA_CANONICAL_HANDOFF_SHA256",
  ).toLowerCase();
  const supabaseProjectRef = requiredEnvironment(
    "ATHENA_SUPABASE_PROJECT_REF",
  );

  if (!GIT_HEAD_PATTERN.test(expectedRepositoryHead)) {
    throw new Error("Configured canonical repository HEAD is invalid.");
  }

  if (!SHA256_PATTERN.test(expectedHandoffSha256)) {
    throw new Error("Configured canonical handoff SHA-256 is invalid.");
  }

  if (supabaseProjectRef !== "voiwlcvfahykdldtjeqy") {
    throw new Error("Configured Supabase project identity is not Athena OS.");
  }

  const topLevel = path.resolve(
    await runGit(repositoryPath, ["rev-parse", "--show-toplevel"]),
  );

  const sameRepositoryPath =
    process.platform === "win32"
      ? topLevel.toLowerCase() === repositoryPath.toLowerCase()
      : topLevel === repositoryPath;

  if (!sameRepositoryPath) {
    throw new Error(
      `Repository root mismatch. Expected ${repositoryPath}; found ${topLevel}.`,
    );
  }

  const repositoryHead = (
    await runGit(repositoryPath, ["rev-parse", "HEAD"])
  ).toLowerCase();

  if (repositoryHead !== expectedRepositoryHead) {
    throw new Error(
      `Repository HEAD mismatch. Expected ${expectedRepositoryHead}; found ${repositoryHead}.`,
    );
  }

  const trackedDiff = await runGit(repositoryPath, [
    "diff",
    "--no-ext-diff",
    "--name-only",
    "HEAD",
    "--",
    ".",
  ]);
  const stagedDiff = await runGit(repositoryPath, [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--name-only",
    "--",
    ".",
  ]);

  if (trackedDiff) {
    throw new Error(
      "Tracked repository changes exist. Canonical lifecycle execution is blocked.",
    );
  }

  if (stagedDiff) {
    throw new Error(
      "Staged repository changes exist. Canonical lifecycle execution is blocked.",
    );
  }

  const handoffBytes = await readFile(handoffPath);
  const actualHandoffSha256 = sha256(handoffBytes);

  if (actualHandoffSha256 !== expectedHandoffSha256) {
    throw new Error(
      `Canonical handoff checksum mismatch. Expected ${expectedHandoffSha256}; found ${actualHandoffSha256}.`,
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  if (!supabaseUrl.includes(supabaseProjectRef)) {
    throw new Error(
      "The configured Supabase URL does not match the canonical Athena OS project.",
    );
  }

  return {
    handoffPath,
    handoffVersion,
    handoffSha256: actualHandoffSha256,
    repositoryPath,
    repositoryHead,
    supabaseProjectRef,
    trackedDiffEmpty: true,
    stagedDiffEmpty: true,
  };
}
