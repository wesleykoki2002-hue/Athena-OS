import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  ExternalProjectCompletionProfile,
} from "./external-project-completion-profile";

import type {
  ExternalProjectAliasRow,
  ExternalProjectDatabaseSnapshot,
  ExternalProjectIntelligenceRow,
  ExternalProjectProductIngredientRow,
  ExternalProjectProductRow,
  ExternalProjectQueueRow,
} from "./external-project-database-evidence";

type ReadResult = {
  data: unknown;
  error: {
    message: string;
  } | null;
  count?: number | null;
};

export type ExternalProjectDatabaseReaderOptions = {
  finalMigrationHistoryRows: number;
};

function requiredRows<T>(
  label: string,
  result: ReadResult,
): T[] {
  if (result.error) {
    throw new Error(
      `${label} read failed: ${result.error.message}`,
    );
  }

  if (!Array.isArray(result.data)) {
    throw new Error(
      `${label} read did not return an array.`,
    );
  }

  return result.data as T[];
}

function requiredCount(
  label: string,
  result: ReadResult,
): number {
  if (result.error) {
    throw new Error(
      `${label} count failed: ${result.error.message}`,
    );
  }

  if (
    typeof result.count !== "number" ||
    !Number.isInteger(result.count) ||
    result.count < 0
  ) {
    throw new Error(
      `${label} count was not returned.`,
    );
  }

  return result.count;
}

function uniqueValues(
  values: readonly string[],
): string[] {
  return Array.from(
    new Set(values),
  ).sort();
}

export async function
loadExternalProjectDatabaseSnapshot(
  profile: ExternalProjectCompletionProfile,
  supabase: SupabaseClient,
  options: ExternalProjectDatabaseReaderOptions,
): Promise<ExternalProjectDatabaseSnapshot> {
  if (
    !Number.isInteger(
      options.finalMigrationHistoryRows,
    ) ||
    options.finalMigrationHistoryRows < 0
  ) {
    throw new Error(
      "Final migration-history evidence must be a non-negative integer.",
    );
  }

  const launchProductIds =
    uniqueValues(
      profile.launchProductIds,
    );

  const canonicalIds =
    uniqueValues(
      profile.mappings.map(
        (mapping) =>
          mapping.canonicalId,
      ),
    );

  const governedSourceNames =
    uniqueValues([
      ...profile.mappings.map(
        (mapping) =>
          mapping.normalizedSourceName,
      ),
      ...profile.holds.map(
        (hold) =>
          hold.normalizedSourceName,
      ),
    ]);

  const [
    productsResult,
    productIngredientsResult,
    queueRowsResult,
    intelligenceRowsResult,
    aliasRowsResult,
    compatibilityCountResult,
    legacyMatchCountResult,
  ] = await Promise.all([
    supabase
      .from("beautydna_products")
      .select(
        "id, approval_status",
      )
      .in(
        "id",
        launchProductIds,
      ),

    supabase
      .from(
        "beautydna_product_ingredients",
      )
      .select(
        [
          "id",
          "product_id",
          "ingredient_id",
          "ingredient_name",
          "normalized_ingredient_name",
          "match_status",
          "review_status",
          "metadata",
        ].join(", "),
      )
      .in(
        "product_id",
        launchProductIds,
      ),

    supabase
      .from(
        "beautydna_ingredient_review_queue",
      )
      .select(
        [
          "id",
          "product_id",
          "ingredient_name",
          "normalized_ingredient_name",
          "status",
          "resolved_ingredient_id",
          "metadata",
        ].join(", "),
      )
      .in(
        "product_id",
        launchProductIds,
      ),

    supabase
      .from(
        "beautydna_ingredient_intelligence",
      )
      .select(
        [
          "id",
          "ingredient_name",
          "normalized_name",
          "normalized_ingredient_name",
          "review_status",
          "metadata",
        ].join(", "),
      )
      .in(
        "id",
        canonicalIds,
      ),

    supabase
      .from(
        "beautydna_ingredient_aliases",
      )
      .select(
        [
          "id",
          "normalized_alias_name",
          "ingredient_id",
        ].join(", "),
      )
      .in(
        "normalized_alias_name",
        governedSourceNames,
      ),

    supabase
      .from(
        "beautydna_ingredient_compatibility_rules",
      )
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      ),

    supabase
      .from(
        "beautydna_product_ingredient_matches",
      )
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      ),
  ]);

  const products =
    requiredRows<
      ExternalProjectProductRow
    >(
      "beautydna_products",
      productsResult,
    );

  const productIngredients =
    requiredRows<
      ExternalProjectProductIngredientRow
    >(
      "beautydna_product_ingredients",
      productIngredientsResult,
    );

  const queueRows =
    requiredRows<
      ExternalProjectQueueRow
    >(
      "beautydna_ingredient_review_queue",
      queueRowsResult,
    );

  const intelligenceRows =
    requiredRows<
      ExternalProjectIntelligenceRow
    >(
      "beautydna_ingredient_intelligence",
      intelligenceRowsResult,
    );

  const aliasRows =
    requiredRows<
      ExternalProjectAliasRow
    >(
      "beautydna_ingredient_aliases",
      aliasRowsResult,
    );

  return {
    products,
    productIngredients,
    queueRows,
    intelligenceRows,
    aliasRows,

    compatibilityRuleRows:
      requiredCount(
        "beautydna_ingredient_compatibility_rules",
        compatibilityCountResult,
      ),

    legacyMatchRows:
      requiredCount(
        "beautydna_product_ingredient_matches",
        legacyMatchCountResult,
      ),

    finalMigrationHistoryRows:
      options.finalMigrationHistoryRows,
  };
}