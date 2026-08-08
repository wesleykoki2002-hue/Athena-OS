import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const automaticSource = readFileSync(
  new URL("../src/lib/qa/automatic-evidence.ts", import.meta.url),
  "utf8",
);

const wrapperSource = readFileSync(
  new URL("../src/lib/qa/external-project-repository-only-evidence.ts", import.meta.url),
  "utf8",
);

test("registers repository-only profile selection in automatic QA", () => {
  assert.match(automaticSource, /selectExternalProjectRepositoryOnlyProfile/);
  assert.match(automaticSource, /externalProjectRepositoryOnlyProfile/);
});

test("repository-only helper never creates a product Supabase client", () => {
  const start = automaticSource.indexOf(
    "async function addExternalProjectRepositoryOnlyEvidence",
  );
  const end = automaticSource.indexOf(
    "async function persistAutomaticUpdates",
    start,
  );
  const helper = automaticSource.slice(start, end);

  assert.ok(start >= 0);
  assert.equal(helper.includes("createExternalProjectSupabaseClient"), false);
  assert.equal(helper.includes("loadExternalProjectDatabaseSnapshot"), false);
  assert.equal(helper.includes("evaluateExternalProjectDatabaseEvidence"), false);
  assert.equal(helper.includes("catch"), false);
  assert.match(helper, /await verifyExternalProjectRepositoryOnlyEvidence/);
});

test("repository-only evidence is assigned before unknown-project pending fallback", () => {
  const branch = automaticSource.indexOf(
    "externalProjectRepositoryOnlyProfile\n  ) {",
  );
  const fallback = automaticSource.indexOf("const genericPending");

  assert.ok(branch >= 0);
  assert.ok(fallback > branch);
});

test("preserves the original database-backed external-project branch", () => {
  assert.match(automaticSource, /await addExternalProjectCompletionEvidence/);
  assert.match(automaticSource, /createExternalProjectSupabaseClient/);
  assert.match(automaticSource, /loadExternalProjectDatabaseSnapshot/);
});

test("keeps production adapter behind a server-only wrapper", () => {
  assert.match(wrapperSource, /^import "server-only";\n/);
  assert.equal(wrapperSource.includes("NEXT_PUBLIC_"), false);
});
