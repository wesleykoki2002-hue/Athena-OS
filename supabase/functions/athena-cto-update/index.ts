import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-athena-admin-key, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function readRequiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function readOptionalString(
  body: Record<string, unknown>,
  field: string,
): string | null {
  const value = body[field];

  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${field} must be text.`);
  }

  return value.trim() || null;
}

function readStringArray(
  body: Record<string, unknown>,
  field: string,
): string[] {
  const value = body[field];

  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function readNonNegativeNumber(
  body: Record<string, unknown>,
  field: string,
): number {
  const value = body[field] ?? 0;
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a finite non-negative number.`);
  }

  return numberValue;
}

function assertNoSecrets(body: Record<string, unknown>): void {
  const serialized = JSON.stringify(body);

  const secretPatterns: Array<{ name: string; pattern: RegExp }> = [
    {
      name: "service-role credential",
      pattern: /service[_\s-]?role[_\s-]?(key|token)\s*[:=]/i,
    },
    {
      name: "password",
      pattern: /password\s*[:=]\s*\S+/i,
    },
    {
      name: "API key",
      pattern: /api[_\s-]?key\s*[:=]\s*\S+/i,
    },
    {
      name: "access token",
      pattern: /access[_\s-]?token\s*[:=]\s*\S+/i,
    },
    {
      name: "secret",
      pattern: /secret\s*[:=]\s*\S+/i,
    },
    {
      name: "JWT",
      pattern:
        /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    },
    {
      name: "Supabase personal token",
      pattern: /\bsbp_[A-Za-z0-9_-]{10,}\b/,
    },
    {
      name: "secret key",
      pattern: /\bsk-[A-Za-z0-9_-]{10,}\b/,
    },
  ];

  const match = secretPatterns.find(({ pattern }) => pattern.test(serialized));

  if (match) {
    throw new Error(
      `Recording blocked because the payload may contain a ${match.name}. Remove all secrets before recording.`,
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        verified: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  try {
    const expectedAdminKey = Deno.env.get("ATHENA_ADMIN_KEY");
    const receivedAdminKey = req.headers.get("x-athena-admin-key");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!expectedAdminKey) {
      return jsonResponse(
        {
          ok: false,
          verified: false,
          error: "ATHENA_ADMIN_KEY is not configured.",
        },
        500,
      );
    }

    if (receivedAdminKey !== expectedAdminKey) {
      return jsonResponse(
        {
          ok: false,
          verified: false,
          error: "Unauthorized.",
        },
        401,
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          ok: false,
          verified: false,
          error: "Supabase server configuration is incomplete.",
        },
        500,
      );
    }

    const body = await req.json() as Record<string, unknown>;

    assertNoSecrets(body);

    const projectKey = readRequiredString(body, "product_key");
    const moduleKey = readRequiredString(body, "module_key");
    const sessionTitle = readRequiredString(body, "session_title");

    const featureName = readOptionalString(body, "feature_name");
    const routePath = readOptionalString(body, "route_path");
    const summary = readOptionalString(body, "summary");

    const planned = readStringArray(body, "planned");
    const completed = readStringArray(body, "completed");
    const filesCreated = readStringArray(body, "files_created");
    const filesModified = readStringArray(body, "files_modified");
    const databaseChanges = readStringArray(body, "database_changes");
    const errors = readStringArray(body, "errors");
    const decisions = readStringArray(body, "decisions");
    const securityNotes = readStringArray(body, "security_notes");
    const missing = readStringArray(body, "missing");
    const nextSteps = readStringArray(body, "next_steps");

    const hoursSpent = readNonNegativeNumber(body, "hours_spent");
    const estimatedRemainingHours = readNonNegativeNumber(
      body,
      "estimated_remaining_hours",
    );

    if (completed.length === 0) {
      throw new Error("completed must contain at least one completed item.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: project, error: projectError } = await supabase
      .from("athena_projects")
      .select("project_key")
      .eq("project_key", projectKey)
      .maybeSingle();

    if (projectError) {
      throw new Error(
        `Could not verify canonical project: ${projectError.message}`,
      );
    }

    if (!project) {
      return jsonResponse(
        {
          ok: false,
          verified: false,
          error: `Project ${projectKey} is not registered in public.athena_projects.`,
        },
        400,
      );
    }

    const { data: moduleRow, error: moduleError } = await supabase
      .from("athena_project_modules")
      .select("project_key, module_key")
      .eq("project_key", projectKey)
      .eq("module_key", moduleKey)
      .maybeSingle();

    if (moduleError) {
      throw new Error(
        `Could not verify canonical module: ${moduleError.message}`,
      );
    }

    if (!moduleRow) {
      return jsonResponse(
        {
          ok: false,
          verified: false,
          error:
            `Module ${moduleKey} is not registered under project ${projectKey}.`,
        },
        400,
      );
    }

    const { data: existingBuildLog, error: duplicateReadError } =
      await supabase
        .from("athena_build_logs")
        .select("id, product_key, session_title, created_at")
        .eq("product_key", projectKey)
        .eq("session_title", sessionTitle)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (duplicateReadError) {
      throw new Error(
        `Could not check for duplicate build log: ${duplicateReadError.message}`,
      );
    }

    if (existingBuildLog) {
      return jsonResponse(
        {
          ok: false,
          verified: false,
          duplicate: true,
          error:
            `A build log already exists for ${projectKey} and ${sessionTitle}.`,
          existing_build_log: existingBuildLog,
        },
        409,
      );
    }

    const { data: buildLog, error: buildError } = await supabase
      .from("athena_build_logs")
      .insert({
        product_key: projectKey,
        session_title: sessionTitle,
        planned,
        completed,
        files_created: filesCreated,
        files_modified: filesModified,
        database_changes: databaseChanges,
        errors,
        decisions,
        security_notes: securityNotes,
        missing,
        next_steps: nextSteps,
        hours_spent: hoursSpent,
        estimated_remaining_hours: estimatedRemainingHours,
        metadata: {
          source: "athena-cto-update",
          project_key: projectKey,
          module_key: moduleKey,
          feature_name: featureName,
          route_path: routePath,
          summary,
          canonical_registry_verified: true,
          verified_at: new Date().toISOString(),
        },
      })
      .select("id, product_key, session_title, created_at, metadata")
      .single();

    if (buildError || !buildLog) {
      throw new Error(
        `Build-log insert failed: ${buildError?.message || "No row returned."}`,
      );
    }

    if (
      buildLog.product_key !== projectKey ||
      buildLog.session_title !== sessionTitle
    ) {
      throw new Error(
        "Build-log verification failed because the returned row does not match the requested project and session.",
      );
    }

    if (nextSteps.length > 0) {
      const nextStepRows = nextSteps.map((step) => ({
        product_key: projectKey,
        title: step,
        description: `Created from Athena CTO build update for module ${moduleKey}.`,
        priority: "P1",
        source: "athena-cto-update",
      }));

      const { error: nextStepsError } = await supabase
        .from("athena_cto_next_steps")
        .insert(nextStepRows);

      if (nextStepsError) {
        const { error: rollbackError } = await supabase
          .from("athena_build_logs")
          .delete()
          .eq("id", buildLog.id);

        if (rollbackError) {
          throw new Error(
            `Next-step recording failed and build-log rollback also failed. Next-step error: ${nextStepsError.message}. Rollback error: ${rollbackError.message}`,
          );
        }

        throw new Error(
          `Next-step recording failed. The new build log was rolled back: ${nextStepsError.message}`,
        );
      }
    }

    return jsonResponse({
      ok: true,
      verified: true,
      canonical_project_verified: true,
      canonical_module_verified: true,
      project_key: projectKey,
      module_key: moduleKey,
      build_log: buildLog,
      next_step_count: nextSteps.length,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        verified: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
