
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type {
  ExternalProjectCompletionProfile,
} from "./external-project-completion-profile";

type ExternalProjectClientOptions = {
  auth: {
    persistSession: false;
    autoRefreshToken: false;
  };
};

export type ExternalProjectSupabaseClientFactory = (
  supabaseUrl: string,
  serviceRoleKey: string,
  options: ExternalProjectClientOptions,
) => SupabaseClient;

function requiredEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value =
    environment[name]?.trim();

  if (!value) {
    throw new Error(
      `Required external-project environment setting is missing: ${name}`,
    );
  }

  return value;
}

function validateSupabaseUrl(
  supabaseUrl: string,
  expectedProjectRef: string,
): void {
  let parsedUrl: URL;

  try {
    parsedUrl =
      new URL(supabaseUrl);
  } catch {
    throw new Error(
      "The external-project Supabase URL is invalid.",
    );
  }

  const expectedHostname =
    `${expectedProjectRef}.supabase.co`;

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !==
      expectedHostname ||
    parsedUrl.port !== "" ||
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    (
      parsedUrl.pathname !== "" &&
      parsedUrl.pathname !== "/"
    ) ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== ""
  ) {
    throw new Error(
      "The external-project Supabase URL does not match the governed hosted project.",
    );
  }
}

const defaultClientFactory:
ExternalProjectSupabaseClientFactory = (
  supabaseUrl,
  serviceRoleKey,
  options,
) =>
  createClient(
    supabaseUrl,
    serviceRoleKey,
    options,
  );

export function
createExternalProjectSupabaseClient(
  profile: Pick<ExternalProjectCompletionProfile, "target">,
  environment: NodeJS.ProcessEnv =
    process.env,
  clientFactory:
    ExternalProjectSupabaseClientFactory =
      defaultClientFactory,
): SupabaseClient {
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

  const supabaseUrl =
    requiredEnvironment(
      environment,
      profile.target
        .supabaseUrlEnvironment,
    );

  validateSupabaseUrl(
    supabaseUrl,
    profile.target.supabaseProjectRef,
  );

  const serviceRoleKey =
    requiredEnvironment(
      environment,
      profile.target
        .supabaseServiceRoleKeyEnvironment,
    );

  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  } as const;

  return clientFactory(
    supabaseUrl,
    serviceRoleKey,
    options,
  );
}