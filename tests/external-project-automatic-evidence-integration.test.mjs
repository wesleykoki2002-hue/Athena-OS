import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
} from "../src/lib/qa/external-project-completion-profile.ts";

const profile =
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE;

const automaticSource =
  readFileSync(
    new URL(
      "../src/lib/qa/automatic-evidence.ts",
      import.meta.url,
    ),
    "utf8",
  );

const liveEvidenceBytes =
  readFileSync(
    new URL(
      "../evidence/external-projects/bdna-ing-0004-live-security.json",
      import.meta.url,
    ),
  );

const liveEvidence =
  JSON.parse(
    liveEvidenceBytes.toString(
      "utf8",
    ),
  );

test(
  "registers the exact external-project completion profile",
  () => {
    assert.match(
      automaticSource,
      /selectExternalProjectCompletionProfile/,
    );

    assert.match(
      automaticSource,
      /externalProjectProfile/,
    );
  },
);

test(
  "binds the independent live evidence file to its governed hash",
  () => {
    const hash =
      createHash("sha256")
        .update(liveEvidenceBytes)
        .digest("hex");

    assert.equal(
      hash,
      profile.liveSecurityEvidence.sha256,
    );

    assert.equal(
      profile.liveSecurityEvidence
        .relativePath,
      "evidence/external-projects/bdna-ing-0004-live-security.json",
    );

    assert.equal(
      liveEvidence
        .migration_history
        .final_migration_history_rows,
      1,
    );

    assert.equal(
      liveEvidence
        .security
        .rls_enabled_table_count,
      14,
    );

    assert.equal(
      liveEvidence
        .security
        .policy_count,
      0,
    );
  },
);

test(
  "uses live evidence before repository and database evaluation",
  () => {
    const helperStart =
      automaticSource.indexOf(
        "async function addExternalProjectCompletionEvidence",
      );

    const helperEnd =
      automaticSource.indexOf(
        "async function persistAutomaticUpdates",
        helperStart,
      );

    const helper =
      automaticSource.slice(
        helperStart,
        helperEnd,
      );

    const liveIndex =
      helper.indexOf(
        "readExternalProjectLiveSecurityEvidence",
      );

    const repositoryIndex =
      helper.indexOf(
        "verifyExternalProjectRepositoryEvidence",
      );

    const databaseIndex =
      helper.indexOf(
        "evaluateExternalProjectDatabaseEvidence",
      );

    const assignIndex =
      helper.indexOf(
        "Object.assign",
      );

    assert.ok(
      liveIndex >= 0,
    );

    assert.ok(
      repositoryIndex >
        liveIndex,
    );

    assert.ok(
      databaseIndex >
        repositoryIndex,
    );

    assert.ok(
      assignIndex >
        databaseIndex,
    );
  },
);

test(
  "assigns external evidence before generic pending fallback",
  () => {
    const externalBranch =
      automaticSource.indexOf(
        "} else if (externalProjectProfile) {",
      );

    const genericFallback =
      automaticSource.indexOf(
        "const genericPending",
      );

    assert.ok(
      externalBranch >= 0,
    );

    assert.ok(
      genericFallback >
        externalBranch,
    );
  },
);

test(
  "keeps the external evidence branch fail closed",
  () => {
    const helperStart =
      automaticSource.indexOf(
        "async function addExternalProjectCompletionEvidence",
      );

    const helperEnd =
      automaticSource.indexOf(
        "async function persistAutomaticUpdates",
        helperStart,
      );

    const helper =
      automaticSource.slice(
        helperStart,
        helperEnd,
      );

    assert.equal(
      helper.includes("catch"),
      false,
    );

    assert.match(
      helper,
      /await readExternalProjectLiveSecurityEvidence/,
    );

    assert.match(
      helper,
      /await verifyExternalProjectRepositoryEvidence/,
    );

    assert.match(
      helper,
      /await loadExternalProjectDatabaseSnapshot/,
    );
  },
);