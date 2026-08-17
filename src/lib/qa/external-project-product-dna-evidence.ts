import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ExternalProjectRepositoryEvidence,
} from "./external-project-repository-evidence";

import type {
  ExternalProjectProductDnaProfile,
} from "./external-project-product-dna-profile";

type AutomaticQaStatus =
  | "pass"
  | "warning"
  | "fail"
  | "pending"
  | "not_applicable";

export type ExternalProjectProductDnaAutomaticQaUpdate = {
  status: AutomaticQaStatus;
  actual_result: string;
  notes: string;
  evidence: Record<string, unknown>;
};

type PacketIdentity = {
  id: string;
  project_key: string;
  module_key: string;
  build_session_title: string;
};

type ProductRow = {
  id: string;
  source_type: string | null;
  source_key: string | null;
  approval_status: string | null;
  shopify_status: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  metadata: Record<string, unknown> | null;
};

type ProductDnaRow = {
  id: string;
  product_id: string;
  approval_status: string | null;
  dna_payload: Record<string, unknown> | null;
};

type ReadinessRow = {
  product_id: string;
  recommendation_ready: boolean | null;
};

type IngredientRow = {
  id: string;
  product_id: string;
  match_status: string | null;
  review_status: string | null;
  metadata: Record<string, unknown> | null;
};

function qaUpdate(
  status: AutomaticQaStatus,
  actualResult: string,
  notes: string,
  evidence: Record<string, unknown>,
): ExternalProjectProductDnaAutomaticQaUpdate {
  return {
    status,
    actual_result: actualResult,
    notes,
    evidence: {
      automatic_qa: true,
      evidence_version:
        "0083-automatic-qa-evidence-v1",
      ...evidence,
    },
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function assertEqual(
  label: string,
  actual: unknown,
  expected: unknown,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function asObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} is not an object.`);
  }

  return value as Record<string, unknown>;
}

function rows<T>(
  label: string,
  result: {
    data: unknown;
    error: { message: string } | null;
  },
): T[] {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  if (!Array.isArray(result.data)) {
    throw new Error(`${label} did not return rows.`);
  }

  return result.data as T[];
}

function exactIds(
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();

  if (
    JSON.stringify(actualSorted) !==
    JSON.stringify(expectedSorted)
  ) {
    throw new Error(`${label} identity set mismatch.`);
  }
}

function repositoryFile(
  root: string,
  relativePath: string,
): string {
  const normalized =
    relativePath.replace(/\\/g, "/");

  if (
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`Unsafe evidence path: ${relativePath}`);
  }

  const rootPath = path.resolve(root);
  const resolved =
    path.resolve(rootPath, ...normalized.split("/"));

  const normalizePlatformPath = (value: string) =>
    process.platform === "win32"
      ? value.toLowerCase()
      : value;

  const prefix =
    rootPath.endsWith(path.sep)
      ? rootPath
      : `${rootPath}${path.sep}`;

  if (
    resolved !== rootPath &&
    !normalizePlatformPath(resolved).startsWith(
      normalizePlatformPath(prefix),
    )
  ) {
    throw new Error(
      `Evidence path escaped repository: ${relativePath}`,
    );
  }

  return resolved;
}

async function verifySources(
  profile: ExternalProjectProductDnaProfile,
  repository: ExternalProjectRepositoryEvidence,
) {
  const verified: {
    relative_path: string;
    normalized_sha256: string;
  }[] = [];

  for (const expected of profile.sourceFiles) {
    const content =
      await readFile(
        repositoryFile(
          repository.repositoryPath,
          expected.relativePath,
        ),
        "utf8",
      );

    const normalized =
      content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

    const actualHash =
      sha256(normalized);

    assertEqual(
      `Source ${expected.relativePath}`,
      actualHash,
      expected.normalizedSha256,
    );

    verified.push({
      relative_path: expected.relativePath,
      normalized_sha256: actualHash,
    });
  }

  return verified;
}

async function verifyRuntimeEvidence(
  profile: ExternalProjectProductDnaProfile,
  repoRoot: string,
): Promise<string> {
  const raw =
    await readFile(
      repositoryFile(
        repoRoot,
        profile.runtimeEvidence.relativePath,
      ),
    );

  const evidence =
    asObject(
      JSON.parse(raw.toString("utf8")),
      "runtime evidence",
    );

  assertEqual(
    "runtime evidence_version",
    evidence.evidence_version,
    profile.runtimeEvidence.evidenceVersion,
  );

  assertEqual(
    "runtime build_id",
    evidence.build_id,
    "BDNA-PDNA-0001",
  );

  assertEqual(
    "runtime target project",
    evidence.target_supabase_project_ref,
    profile.target.supabaseProjectRef,
  );

  const generator =
    asObject(
      evidence.generator,
      "generator evidence",
    );

  assertEqual("generator version", generator.deployed_version, 12);
  assertEqual(
    "generator normalized hash",
    generator.normalized_sha256,
    "f901aaa7807b1b17d4445f593ea7c695afdd0e714e4fe575757d0dee3968b657",
  );
  assertEqual(
    "production candidates",
    generator.production_candidates,
    0,
  );
  assertEqual(
    "debug launch candidates",
    generator.debug_launch_candidates,
    5,
  );
  assertEqual(
    "approved launch DNA",
    generator.approved_launch_product_dna,
    5,
  );
  assertEqual(
    "null Shopify variants",
    generator.null_launch_shopify_variants,
    5,
  );
  assertEqual(
    "needs Shopify creation",
    generator.needs_shopify_creation_launch_products,
    5,
  );
  assertEqual(
    "governance warning",
    generator.governance_warning_present,
    true,
  );
  assertEqual(
    "generator writes",
    generator.writes_performed,
    false,
  );
  assertEqual(
    "archived generator v11 hash",
    generator.stale_v11_archive_sha256,
    "5d99eb18019ec657cbd1224638f0facdc784d4fb9df6f0de69c2a4e391acbfb0",
  );

  const explainer =
    asObject(
      evidence.explainer,
      "explainer evidence",
    );

  assertEqual("explainer version", explainer.deployed_version, 11);
  assertEqual(
    "explainer normalized hash",
    explainer.normalized_sha256,
    "5181486df6228a2001fbc5348c8d3361e801d282d34935a1c051aff8a0cd85a3",
  );
  assertEqual(
    "explainer empty production status",
    explainer.production_empty_http_status,
    400,
  );
  assertEqual(
    "explainer debug launch candidates",
    explainer.debug_launch_candidates,
    5,
  );
  assertEqual(
    "explainer writes",
    explainer.writes_performed,
    false,
  );

  const shopify =
    asObject(
      evidence.shopify_result,
      "Shopify result evidence",
    );

  assertEqual("Shopify result version", shopify.deployed_version, 8);
  assertEqual(
    "Shopify raw source hash",
    shopify.raw_source_sha256,
    "6d0891f6566678af78e5a8d40f73bc41cc8e8953ea09ef5e9d9e8c497dc1d059",
  );
  assertEqual(
    "Shopify normalized hash",
    shopify.normalized_sha256,
    "2789fab9c33328f106f2caa4ead767a54fbf2c41137e99d8756bc4e7859a424e",
  );
  assertEqual(
    "Shopify zero-state status",
    shopify.production_zero_state_http_status,
    200,
  );
  assertEqual("Shopify ok", shopify.ok, true);
  assertEqual(
    "Shopify customer products",
    shopify.customer_products,
    0,
  );
  assertEqual(
    "Shopify missing steps",
    shopify.missing_steps,
    5,
  );
  assertEqual(
    "Shopify ranked arrays",
    shopify.ranked_arrays_empty,
    true,
  );
  assertEqual(
    "Shopify fabricated claims",
    shopify.fabricated_claims,
    false,
  );
  assertEqual(
    "Shopify linkage write",
    shopify.shopify_linkage_write,
    false,
  );
  assertEqual(
    "archived Shopify-result v7 hash",
    shopify.superseded_v7_archive_sha256,
    "fc07ed1a5cdf2c4bc7f6c79b2d37305766351443ef8786b24579418859e3e359",
  );

  const keyRotation =
    asObject(
      evidence.internal_key_rotation,
      "key rotation evidence",
    );

  assertEqual(
    "key blob hash",
    keyRotation.protected_blob_sha256,
    "2b7ceeefefcb09100af754a3bc61bb4beb1ecd1dc3886c6fe954d992f41976b6",
  );
  assertEqual(
    "key rotation updated_at",
    keyRotation.remote_updated_at,
    "2026-08-17T00:11:37.672Z",
  );
  assertEqual(
    "key plaintext",
    keyRotation.plaintext_recorded,
    false,
  );

  return sha256(raw);
}

export async function
buildExternalProjectProductDnaAutomaticQaUpdates(
  input: {
    profile: ExternalProjectProductDnaProfile;
    packet: PacketIdentity;
    repository: ExternalProjectRepositoryEvidence;
    supabase: SupabaseClient;
    repoRoot: string;
  },
): Promise<
  Record<
    string,
    ExternalProjectProductDnaAutomaticQaUpdate
  >
> {
  const {
    profile,
    packet,
    repository,
    supabase,
    repoRoot,
  } = input;

  assertEqual(
    "packet project",
    packet.project_key,
    profile.packetIdentity.project_key,
  );

  assertEqual(
    "packet module",
    packet.module_key,
    profile.packetIdentity.module_key,
  );

  assertEqual(
    "packet title",
    packet.build_session_title,
    profile.packetIdentity.build_session_title,
  );

  const productIds =
    profile.launchProducts.map(
      (item) => item.productId,
    );

  const dnaIds =
    profile.launchProducts.map(
      (item) => item.dnaId,
    );

  const [
    productResult,
    dnaResult,
    readinessResult,
    ingredientResult,
    sourceEvidence,
    runtimeSha256,
  ] = await Promise.all([
    supabase
      .from("beautydna_products")
      .select(
        "id, source_type, source_key, approval_status, shopify_status, shopify_product_id, shopify_variant_id, metadata",
      )
      .in("id", productIds),

    supabase
      .from("beautydna_product_dna")
      .select(
        "id, product_id, approval_status, dna_payload",
      )
      .in("id", dnaIds),

    supabase
      .from(
        "beautydna_v2_product_readiness",
      )
      .select(
        "product_id, recommendation_ready",
      )
      .in("product_id", productIds),

    supabase
      .from(
        "beautydna_product_ingredients",
      )
      .select(
        "id, product_id, match_status, review_status, metadata",
      )
      .eq(
        "product_id",
        "41f6385a-0d61-4cb3-ac7a-fdaf9c294031",
      )
      .eq(
        "match_status",
        "unmatched",
      ),

    verifySources(
      profile,
      repository,
    ),

    verifyRuntimeEvidence(
      profile,
      repoRoot,
    ),
  ]);

  const products =
    rows<ProductRow>(
      "beautydna_products",
      productResult,
    );

  const dnaRows =
    rows<ProductDnaRow>(
      "beautydna_product_dna",
      dnaResult,
    );

  const readinessRows =
    rows<ReadinessRow>(
      "beautydna_v2_product_readiness",
      readinessResult,
    );

  const ingredientRows =
    rows<IngredientRow>(
      "beautydna_product_ingredients",
      ingredientResult,
    );

  exactIds(
    "products",
    products.map((row) => row.id),
    productIds,
  );

  exactIds(
    "Product DNA",
    dnaRows.map((row) => row.id),
    dnaIds,
  );

  exactIds(
    "readiness",
    readinessRows.map(
      (row) => row.product_id,
    ),
    productIds,
  );

  exactIds(
    "preserved unmatched ingredients",
    ingredientRows.map(
      (row) => row.id,
    ),
    profile.preservedUnmatched.map(
      (row) => row.productIngredientId,
    ),
  );

  for (const expected of profile.launchProducts) {
    const product =
      products.find(
        (row) =>
          row.id === expected.productId,
      );

    if (!product) {
      throw new Error(
        `Missing product ${expected.productId}.`,
      );
    }

    assertEqual(
      `${product.id} source_type`,
      product.source_type,
      "beautydna_launch_catalog",
    );

    assertEqual(
      `${product.id} source_key`,
      product.source_key,
      expected.sourceKey,
    );

    assertEqual(
      `${product.id} approval`,
      product.approval_status,
      "approved",
    );

    assertEqual(
      `${product.id} Shopify status`,
      product.shopify_status,
      "needs_shopify_creation",
    );

    assertEqual(
      `${product.id} Shopify product`,
      product.shopify_product_id,
      null,
    );

    assertEqual(
      `${product.id} Shopify variant`,
      product.shopify_variant_id,
      null,
    );

    const metadata =
      asObject(
        product.metadata,
        `${product.id} metadata`,
      );

    const review =
      asObject(
        metadata.bdna_pdna_0001_review,
        `${product.id} review`,
      );

    assertEqual(
      `${product.id} review build`,
      review.build_id,
      "BDNA-PDNA-0001",
    );

    assertEqual(
      `${product.id} review outcome`,
      review.review_outcome,
      "approved",
    );

    assertEqual(
      `${product.id} reviewed_by`,
      review.reviewed_by,
      "Wesley Kato",
    );

    assertEqual(
      `${product.id} evidence class`,
      review.evidence_class,
      "manufacturer_official",
    );

    assertEqual(
      `${product.id} linkage changed`,
      review.shopify_linkage_changed,
      false,
    );

    if (
      typeof review.manufacturer_source_url !== "string" ||
      review.manufacturer_source_url.length === 0
    ) {
      throw new Error(
        `${product.id} manufacturer_source_url is missing.`,
      );
    }

    if (
      typeof review.reviewed_at !== "string" ||
      review.reviewed_at.length === 0
    ) {
      throw new Error(
        `${product.id} reviewed_at is missing.`,
      );
    }
  }

  for (const expected of profile.launchProducts) {
    const dna =
      dnaRows.find(
        (row) =>
          row.id === expected.dnaId,
      );

    if (!dna) {
      throw new Error(
        `Missing Product DNA ${expected.dnaId}.`,
      );
    }

    assertEqual(
      `${dna.id} product`,
      dna.product_id,
      expected.productId,
    );

    assertEqual(
      `${dna.id} approval`,
      dna.approval_status,
      "approved",
    );

    const payload =
      asObject(
        dna.dna_payload,
        `${dna.id} dna_payload`,
      );

    const review =
      asObject(
        payload.bdna_pdna_0001_review,
        `${dna.id} review`,
      );

    assertEqual(
      `${dna.id} review build`,
      review.build_id,
      "BDNA-PDNA-0001",
    );

    assertEqual(
      `${dna.id} review outcome`,
      review.review_outcome,
      "approved",
    );

    assertEqual(
      `${dna.id} reviewed_by`,
      review.reviewed_by,
      "Wesley Kato",
    );

    assertEqual(
      `${dna.id} evidence class`,
      review.evidence_class,
      "manufacturer_official",
    );

    assertEqual(
      `${dna.id} unsupported removed`,
      review.unsupported_values_removed,
      true,
    );

    if (
      typeof review.manufacturer_source_url !== "string" ||
      review.manufacturer_source_url.length === 0
    ) {
      throw new Error(
        `${dna.id} manufacturer_source_url is missing.`,
      );
    }

    if (
      typeof review.reviewed_at !== "string" ||
      review.reviewed_at.length === 0
    ) {
      throw new Error(
        `${dna.id} reviewed_at is missing.`,
      );
    }
  }

  for (
    const expected of
    profile.preservedUnmatched
  ) {
    const ingredient =
      ingredientRows.find(
        (row) =>
          row.id ===
          expected.productIngredientId,
      );

    if (!ingredient) {
      throw new Error(
        `Missing governed unmatched ingredient ${expected.productIngredientId}.`,
      );
    }

    assertEqual(
      `${ingredient.id} match_status`,
      ingredient.match_status,
      "unmatched",
    );

    assertEqual(
      `${ingredient.id} review_status`,
      ingredient.review_status,
      "needs_review",
    );

    const metadata =
      asObject(
        ingredient.metadata,
        `${ingredient.id} metadata`,
      );

    assertEqual(
      `${ingredient.id} held_by_build`,
      metadata.held_by_build,
      "BDNA-ING-0004",
    );

    assertEqual(
      `${ingredient.id} identity_review_status`,
      metadata.identity_review_status,
      expected.identityReviewStatus,
    );
  }

  const metrics = {
    approvedProducts:
      products.filter(
        (row) =>
          row.approval_status === "approved",
      ).length,

    approvedProductDnaRows:
      dnaRows.filter(
        (row) =>
          row.approval_status === "approved",
      ).length,

    shopifyUnlinkedProducts:
      products.filter(
        (row) =>
          row.shopify_status ===
            "needs_shopify_creation" &&
          row.shopify_product_id === null &&
          row.shopify_variant_id === null,
      ).length,

    recommendationReadyProducts:
      readinessRows.filter(
        (row) =>
          row.recommendation_ready === true,
      ).length,

    preservedUnmatchedIngredients:
      ingredientRows.length,
  };

  for (
    const [key, expected] of
    Object.entries(
      profile.expectedMetrics,
    )
  ) {
    assertEqual(
      `metric ${key}`,
      metrics[
        key as keyof typeof metrics
      ],
      expected,
    );
  }

  const securityTokenCount =
    repository.migrations.reduce(
      (total, migration) =>
        total +
        Object.values(
          migration.securityTokenCounts,
        ).reduce(
          (sum, count) => sum + count,
          0,
        ),
      0,
    );

  assertEqual(
    "migration security token count",
    securityTokenCount,
    profile.expectedSecurity
      .migrationSecurityTokenCount,
  );

  const commonEvidence = {
    source:
      "external_project_product_dna_completion_evidence",
    profile_key:
      profile.profileKey,
    completion_packet_id:
      packet.id,
    project_key:
      packet.project_key,
    module_key:
      packet.module_key,
    build_session_title:
      packet.build_session_title,
    target_supabase_project_ref:
      profile.target.supabaseProjectRef,
    repository_remote:
      repository.repositoryRemote,
    repository_branch:
      repository.repositoryBranch,
    repository_head:
      repository.repositoryHead,
    repository_tree:
      repository.repositoryTree,
    repository_evidence_sha256:
      repository.repositoryEvidenceSha256,
    migration_count:
      repository.migrations.length,
    migration_security_token_count:
      securityTokenCount,
    source_files:
      sourceEvidence,
    runtime_evidence_relative_path:
      profile.runtimeEvidence.relativePath,
    runtime_evidence_sha256:
      runtimeSha256,
    metrics,
    read_only_verified: true,
  };

  return {
    route_or_function_exists:
      qaUpdate(
        "pass",
        "The BeautyDNA generator, explainer, and Shopify-result sources matched the production-accepted source identities.",
        "Automatic QA verified the governed runtime source hashes and persisted runtime-acceptance evidence.",
        commonEvidence,
      ),

    ui_shows_expected_new_fields:
      qaUpdate(
        "not_applicable",
        "BDNA-PDNA-0001 has no UI-field scope.",
        "This build governs Product DNA, recommendation eligibility, and fail-closed Shopify zero-state behavior.",
        {
          ...commonEvidence,
          applicability:
            "no_ui_scope",
        },
      ),

    database_read_verified:
      qaUpdate(
        "pass",
        "BeautyDNA readback verified 5 approved products, 5 approved Product DNA rows, 5 Shopify-unlinked products, 0 recommendation-ready launch products, and 3 preserved unresolved Curﾃｩl ingredients.",
        "The governed launch scope matched every required production postcondition.",
        commonEvidence,
      ),

    database_write_verified:
      qaUpdate(
        "pass",
        "The governed migration and database readback verify the intended BDNA-PDNA-0001 persisted changes.",
        "The migration hash, product reviews, Product DNA reviews, and unchanged Shopify linkage all matched.",
        {
          ...commonEvidence,
          migration_relative_path:
            profile.migrations[0]
              ?.relativePath,
          migration_sha256:
            profile.migrations[0]
              ?.sha256,
        },
      ),

    saved_row_verified:
      qaUpdate(
        "pass",
        "All 5 product approvals, 5 Product DNA approvals, and the exact 3 preserved BDNA-ING-0004 ingredient holds were verified.",
        "Saved-row identity and governed metadata matched the approved scope.",
        commonEvidence,
      ),

    rls_policy_reviewed:
      qaUpdate(
        "pass",
        "BDNA-PDNA-0001 contains no RLS, policy, grant, revoke, SECURITY DEFINER, or search_path changes.",
        "The governed migration produced zero database-security tokens.",
        commonEvidence,
      ),
  };
}