import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE,
} from "../src/lib/qa/external-project-completion-profile.ts";

import {
  createExternalProjectSupabaseClient,
} from "../src/lib/qa/external-project-supabase-client-core.ts";

const profile =
  BDNA_ING_0004_EXTERNAL_COMPLETION_PROFILE;

const wrapperSource =
  readFileSync(
    new URL(
      "../src/lib/qa/external-project-supabase-client.ts",
      import.meta.url,
    ),
    "utf8",
  );

function createEnvironment() {
  return {
    ATHENA_BEAUTY_OS_SUPABASE_PROJECT_REF:
      "hidsyvanaipxxyyhjgmc",

    ATHENA_BEAUTY_OS_SUPABASE_URL:
      "https://hidsyvanaipxxyyhjgmc.supabase.co",

    ATHENA_BEAUTY_OS_SUPABASE_SERVICE_ROLE_KEY:
      "fixture-service-role-key",
  };
}

test(
  "creates the governed client with exact server-only configuration",
  () => {
    const calls = [];

    const fixtureClient = {
      kind: "fixture-client",
    };

    const result =
      createExternalProjectSupabaseClient(
        profile,
        createEnvironment(),
        (
          supabaseUrl,
          serviceRoleKey,
          options,
        ) => {
          calls.push({
            supabaseUrl,
            serviceRoleKey,
            options,
          });

          return fixtureClient;
        },
      );

    assert.equal(
      result,
      fixtureClient,
    );

    assert.deepEqual(
      calls,
      [
        {
          supabaseUrl:
            "https://hidsyvanaipxxyyhjgmc.supabase.co",

          serviceRoleKey:
            "fixture-service-role-key",

          options: {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          },
        },
      ],
    );
  },
);

test(
  "reads only the exact governed environment settings",
  () => {
    const accessedNames = [];

    const environment =
      new Proxy(
        createEnvironment(),
        {
          get(target, property) {
            if (
              typeof property === "string"
            ) {
              accessedNames.push(
                property,
              );
            }

            return Reflect.get(
              target,
              property,
            );
          },
        },
      );

    createExternalProjectSupabaseClient(
      profile,
      environment,
      () => ({
        kind: "fixture-client",
      }),
    );

    assert.deepEqual(
      [...new Set(accessedNames)].sort(),
      [
        "ATHENA_BEAUTY_OS_SUPABASE_PROJECT_REF",
        "ATHENA_BEAUTY_OS_SUPABASE_SERVICE_ROLE_KEY",
        "ATHENA_BEAUTY_OS_SUPABASE_URL",
      ],
    );

    assert.equal(
      accessedNames.some(
        (name) =>
          name.startsWith(
            "NEXT_PUBLIC_",
          ),
      ),
      false,
    );
  },
);

for (const environmentName of [
  "ATHENA_BEAUTY_OS_SUPABASE_PROJECT_REF",
  "ATHENA_BEAUTY_OS_SUPABASE_URL",
  "ATHENA_BEAUTY_OS_SUPABASE_SERVICE_ROLE_KEY",
]) {
  test(
    `fails when ${environmentName} is missing`,
    () => {
      const environment =
        createEnvironment();

      delete environment[
        environmentName
      ];

      assert.throws(
        () =>
          createExternalProjectSupabaseClient(
            profile,
            environment,
            () => ({
              kind:
                "unexpected-client",
            }),
          ),
        new RegExp(
          environmentName,
        ),
      );
    },
  );
}

test(
  "fails when the configured project reference is wrong",
  () => {
    const environment =
      createEnvironment();

    environment
      .ATHENA_BEAUTY_OS_SUPABASE_PROJECT_REF =
        "wrong-project-ref";

    assert.throws(
      () =>
        createExternalProjectSupabaseClient(
          profile,
          environment,
          () => ({
            kind:
              "unexpected-client",
          }),
        ),
      /Supabase identity/,
    );
  },
);

test(
  "fails when the Supabase hostname is wrong",
  () => {
    const environment =
      createEnvironment();

    environment
      .ATHENA_BEAUTY_OS_SUPABASE_URL =
        "https://wrong-project.supabase.co";

    assert.throws(
      () =>
        createExternalProjectSupabaseClient(
          profile,
          environment,
          () => ({
            kind:
              "unexpected-client",
          }),
        ),
      /governed hosted project/,
    );
  },
);

test(
  "fails when the Supabase URL is not HTTPS",
  () => {
    const environment =
      createEnvironment();

    environment
      .ATHENA_BEAUTY_OS_SUPABASE_URL =
        "http://hidsyvanaipxxyyhjgmc.supabase.co";

    assert.throws(
      () =>
        createExternalProjectSupabaseClient(
          profile,
          environment,
          () => ({
            kind:
              "unexpected-client",
          }),
        ),
      /governed hosted project/,
    );
  },
);

test(
  "fails when the Supabase URL contains an ungoverned path or query",
  () => {
    const environment =
      createEnvironment();

    environment
      .ATHENA_BEAUTY_OS_SUPABASE_URL =
        "https://hidsyvanaipxxyyhjgmc.supabase.co/rest?unsafe=true";

    assert.throws(
      () =>
        createExternalProjectSupabaseClient(
          profile,
          environment,
          () => ({
            kind:
              "unexpected-client",
          }),
        ),
      /governed hosted project/,
    );
  },
);

test(
  "does not mutate the governed profile",
  () => {
    const before =
      structuredClone(profile);

    createExternalProjectSupabaseClient(
      profile,
      createEnvironment(),
      () => ({
        kind: "fixture-client",
      }),
    );

    assert.deepEqual(
      profile,
      before,
    );
  },
);
test(
  "keeps the production client behind the server-only wrapper",
  () => {
    assert.match(
      wrapperSource,
      /^import "server-only";\n/,
    );

    assert.match(
      wrapperSource,
      /from "\.\/external-project-supabase-client-core";/,
    );

    assert.equal(
      wrapperSource.includes(
        "NEXT_PUBLIC_",
      ),
      false,
    );
  },
);