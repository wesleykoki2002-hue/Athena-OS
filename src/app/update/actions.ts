"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";

type AthenaCtoUpdateResponse = {
  ok?: boolean;
  verified?: boolean;
  project_key?: string;
  module_key?: string;
  error?: string;
  build_log?: {
    id?: string;
    product_key?: string;
    session_title?: string;
  };
};

function readFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readList(formData: FormData, key: string) {
  return readFormValue(formData, key)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNumberValue(value: string) {
  return value.length > 0 ? Number(value) : 0;
}

async function getCurrentProjectRemainingHours(projectKey: string) {
  const supabase = createAthenaCoreClient();

  const { data } = await supabase
    .from("athena_projects")
    .select("estimated_remaining_hours")
    .eq("project_key", projectKey)
    .maybeSingle<{ estimated_remaining_hours: number | null }>();

  return Number(data?.estimated_remaining_hours ?? 0);
}

async function deductModuleHours({
  projectKey,
  moduleKey,
  hoursSpent
}: {
  projectKey: string;
  moduleKey: string;
  hoursSpent: number;
}) {
  if (!moduleKey || hoursSpent <= 0) {
    return;
  }

  const supabase = createAthenaCoreClient();

  const { data: moduleRow, error: readError } = await supabase
    .from("athena_project_modules")
    .select("estimated_remaining_hours")
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey)
    .maybeSingle<{ estimated_remaining_hours: number | null }>();

  if (readError) {
    redirect(`/update?error=${encodeURIComponent("Could not read selected module: " + readError.message)}`);
  }

  if (!moduleRow) {
    redirect(`/update?error=${encodeURIComponent("Selected module was not found for this project.")}`);
  }

  const currentModuleHours = Number(moduleRow.estimated_remaining_hours ?? 0);
  const nextModuleHours = Math.max(0, currentModuleHours - hoursSpent);

  const { error: updateError } = await supabase
    .from("athena_project_modules")
    .update({
      estimated_remaining_hours: nextModuleHours
    })
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey);

  if (updateError) {
    redirect(`/update?error=${encodeURIComponent("Could not deduct module hours: " + updateError.message)}`);
  }
}

export async function createAthenaCtoUpdate(formData: FormData) {
  const projectRef = process.env.ATHENA_CORE_PROJECT_REF;
  const adminKey = process.env.ATHENA_CTO_ADMIN_KEY;

  if (!projectRef || !adminKey) {
    redirect(`/update?error=${encodeURIComponent("Missing ATHENA_CORE_PROJECT_REF or ATHENA_CTO_ADMIN_KEY in .env.local")}`);
  }

  const productKey = readFormValue(formData, "product_key");
  const sessionTitle = readFormValue(formData, "session_title");
  const moduleKey = readFormValue(formData, "module_key");
  const hoursSpent = readNumberValue(readFormValue(formData, "hours_spent"));

  if (!productKey || !moduleKey || !sessionTitle) {
    redirect(
      `/update?error=${encodeURIComponent(
        "Project, module key, and session title are required"
      )}`
    );
  }

  const supabase = createAthenaCoreClient();

  const currentProjectRemainingHours =
    await getCurrentProjectRemainingHours(productKey);

  if (!Number.isFinite(currentProjectRemainingHours) || currentProjectRemainingHours < 0) {
    redirect(
      `/update?error=${encodeURIComponent(
        "Current project remaining hours is not a valid non-negative number."
      )}`
    );
  }

  const estimatedRemainingHours = currentProjectRemainingHours;

  const completedBase = readList(formData, "completed");

  const completed =
    moduleKey && hoursSpent > 0
      ? [
          ...completedBase,
          `Deducted ${hoursSpent}h from module ${moduleKey}. Project remaining hours is now ${estimatedRemainingHours}.`
        ]
      : completedBase;

  const body = {
    product_key: productKey,
    module_key: moduleKey,
    session_title: sessionTitle,
    completed,
    files_created: readList(formData, "files_created"),
    files_modified: readList(formData, "files_modified"),
    database_changes: readList(formData, "database_changes"),
    decisions: readList(formData, "decisions"),
    security_notes: readList(formData, "security_notes"),
    missing: readList(formData, "missing"),
    next_steps: readList(formData, "next_steps"),
    hours_spent: hoursSpent,
    estimated_remaining_hours: estimatedRemainingHours
  };

  const response = await fetch(`https://${projectRef}.supabase.co/functions/v1/athena-cto-update`, {
    method: "POST",
    headers: {
      "x-athena-admin-key": adminKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const responseText = await response.text();

  let responseBody: AthenaCtoUpdateResponse | null = null;

  try {
    responseBody = responseText
      ? (JSON.parse(responseText) as AthenaCtoUpdateResponse)
      : null;
  } catch {
    responseBody = null;
  }

  const buildLogId = responseBody?.build_log?.id;

  if (
    !response.ok ||
    responseBody?.ok !== true ||
    responseBody?.verified !== true ||
    responseBody?.project_key !== productKey ||
    responseBody?.module_key !== moduleKey ||
    !buildLogId
  ) {
    const message =
      responseBody?.error ||
      responseText ||
      "Athena CTO update returned an unverified response.";

    redirect(`/update?error=${encodeURIComponent(message)}`);
  }

  const { data: verifiedBuildLog, error: verificationError } = await supabase
    .from("athena_build_logs")
    .select("id, product_key, session_title, metadata")
    .eq("id", buildLogId)
    .eq("product_key", productKey)
    .eq("session_title", sessionTitle)
    .maybeSingle();

  if (verificationError || !verifiedBuildLog) {
    redirect(
      `/update?error=${encodeURIComponent(
        "Athena CTO responded successfully, but the saved build log could not be verified."
      )}`
    );
  }

  await deductModuleHours({
    projectKey: productKey,
    moduleKey,
    hoursSpent
  });

  const { error: commandCenterError } = await supabase.rpc(
    "generate_athena_daily_command_center"
  );

  if (commandCenterError) {
    redirect(
      `/update?error=${encodeURIComponent(
        "Build log was verified, but command-center regeneration failed: " +
          commandCenterError.message
      )}`
    );
  }

  redirect(
    `/update?success=${encodeURIComponent(
      "Athena CTO update recorded and verified"
    )}`
  );
}
