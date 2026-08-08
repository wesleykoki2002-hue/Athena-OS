export type CanonicalTargetSupabaseApplicability =
  | "database_backed"
  | "repository_only_no_product_database";

type CanonicalTargetSupabaseApplicabilityResult = {
  mode: CanonicalTargetSupabaseApplicability;
  supabaseUsage: string | null;
  productDatabase: string | null;
};

function optionalMetadataText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function classifyCanonicalTargetSupabaseApplicability(
  projectMetadata: Record<string, unknown>,
): CanonicalTargetSupabaseApplicabilityResult {
  const hasSupabaseUsage = Object.prototype.hasOwnProperty.call(
    projectMetadata,
    "supabase_usage",
  );
  const hasProductDatabase = Object.prototype.hasOwnProperty.call(
    projectMetadata,
    "product_database",
  );
  const supabaseUsage = optionalMetadataText(projectMetadata.supabase_usage);
  const productDatabase = optionalMetadataText(projectMetadata.product_database);

  if (!hasSupabaseUsage && !hasProductDatabase) {
    return {
      mode: "database_backed",
      supabaseUsage: null,
      productDatabase: null,
    };
  }

  if (
    supabaseUsage === "athena_control_plane_only" &&
    productDatabase === "none"
  ) {
    return {
      mode: "repository_only_no_product_database",
      supabaseUsage,
      productDatabase,
    };
  }

  throw new Error(
    "Canonical target Supabase applicability metadata is missing, contradictory, or unsupported.",
  );
}
