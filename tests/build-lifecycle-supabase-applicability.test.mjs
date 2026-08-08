import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyCanonicalTargetSupabaseApplicability,
} from "../src/lib/build-lifecycle/supabase-applicability.ts";

test("preserves legacy database-backed applicability when no applicability metadata is registered", () => {
  assert.deepEqual(
    classifyCanonicalTargetSupabaseApplicability({
      target_supabase_project_ref: "fixture-database-project",
    }),
    {
      mode: "database_backed",
      supabaseUsage: null,
      productDatabase: null,
    },
  );
});

test("recognizes the existing repository-only no-product-database metadata contract", () => {
  assert.deepEqual(
    classifyCanonicalTargetSupabaseApplicability({
      supabase_usage: "athena_control_plane_only",
      product_database: "none",
    }),
    {
      mode: "repository_only_no_product_database",
      supabaseUsage: "athena_control_plane_only",
      productDatabase: "none",
    },
  );
});

for (const [name, metadata] of [
  [
    "missing product_database",
    { supabase_usage: "athena_control_plane_only" },
  ],
  [
    "missing supabase_usage",
    { product_database: "none" },
  ],
  [
    "blank repository-only metadata",
    { supabase_usage: "", product_database: "" },
  ],
  [
    "contradictory product database",
    {
      supabase_usage: "athena_control_plane_only",
      product_database: "supabase",
    },
  ],
  [
    "unsupported Supabase usage",
    {
      supabase_usage: "product_database",
      product_database: "none",
    },
  ],
]) {
  test(`fails closed for ${name}`, () => {
    assert.throws(
      () => classifyCanonicalTargetSupabaseApplicability(metadata),
      /missing, contradictory, or unsupported/,
    );
  });
}

test("local lifecycle project-ref read is confined to the database-backed branch", async () => {
  const source = await readFile(
    new URL("../src/lib/build-lifecycle/local-evidence.ts", import.meta.url),
    "utf8",
  );

  const branchIndex = source.indexOf(
    'if (target.targetSupabaseApplicability.mode === "database_backed")',
  );
  const projectRefReadIndex = source.indexOf(
    'await readFile(targetProjectRefPath, "utf8")',
  );

  assert.ok(branchIndex >= 0, "database-backed branch must exist");
  assert.ok(projectRefReadIndex > branchIndex, "project-ref read must be inside the database-backed branch");
  assert.match(source, /repository_link_not_applicable/);
});

test("start evidence no longer hard-codes target repository Supabase verification", async () => {
  const [actions, page] = await Promise.all([
    readFile(
      new URL("../src/app/start-build/lifecycle-actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/app/start-build/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of [actions, page]) {
    assert.doesNotMatch(
      source,
      /target_supabase_project_verified:\s*true/,
    );
    assert.match(source, /target_supabase_applicability/);
    assert.match(source, /target_supabase_repository_link_verified/);
    assert.match(source, /product_database/);
  }
});
