"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";

function readFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readNumber(formData: FormData, key: string) {
  const value = readFormValue(formData, key);
  return value ? Number(value) : 0;
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function normalizeModuleKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function regenerateDailyBriefingSafe() {
  const supabase = createAthenaCoreClient();
  await supabase.rpc("generate_athena_daily_command_center");
}

export async function updateAthenaProjectModule(formData: FormData) {
  const projectKey = readFormValue(formData, "project_key");
  const moduleKey = readFormValue(formData, "module_key");

  if (!projectKey || !moduleKey) {
    redirect("/");
  }

  const supabase = createAthenaCoreClient();

  const updatePayload = {
    name: readFormValue(formData, "name"),
    description: readFormValue(formData, "description"),
    status: readFormValue(formData, "status") || "planned",
    priority: readFormValue(formData, "priority") || "P2",
    progress_percent: readNumber(formData, "progress_percent"),
    estimated_remaining_hours: readNumber(formData, "estimated_remaining_hours"),
    reusable: readBoolean(formData, "reusable"),
    notes: readFormValue(formData, "notes") || null
  };

  const { error } = await supabase
    .from("athena_project_modules")
    .update(updatePayload)
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey);

  if (error) {
    redirect(`/projects/${projectKey}/modules?error=${encodeURIComponent(error.message)}`);
  }

  await regenerateDailyBriefingSafe();

  redirect(`/projects/${projectKey}/modules?success=${encodeURIComponent("Module updated")}`);
}

export async function createAthenaProjectModule(formData: FormData) {
  const projectKey = readFormValue(formData, "project_key");
  const rawModuleKey = readFormValue(formData, "module_key");
  const moduleKey = normalizeModuleKey(rawModuleKey);
  const name = readFormValue(formData, "name");

  if (!projectKey || !moduleKey || !name) {
    redirect(`/projects/${projectKey || ""}/modules/new?error=${encodeURIComponent("Project, module key, and module name are required")}`);
  }

  const supabase = createAthenaCoreClient();

  const insertPayload = {
    project_key: projectKey,
    module_key: moduleKey,
    name,
    description: readFormValue(formData, "description"),
    status: readFormValue(formData, "status") || "planned",
    priority: readFormValue(formData, "priority") || "P2",
    progress_percent: readNumber(formData, "progress_percent"),
    estimated_remaining_hours: readNumber(formData, "estimated_remaining_hours"),
    reusable: readBoolean(formData, "reusable"),
    notes: readFormValue(formData, "notes") || null
  };

  const { error } = await supabase
    .from("athena_project_modules")
    .insert(insertPayload);

  if (error) {
    redirect(`/projects/${projectKey}/modules/new?error=${encodeURIComponent(error.message)}`);
  }

  await regenerateDailyBriefingSafe();

  redirect(`/projects/${projectKey}/modules?success=${encodeURIComponent("Module created")}`);
}

export async function archiveAthenaProjectModule(formData: FormData) {
  const projectKey = readFormValue(formData, "project_key");
  const moduleKey = readFormValue(formData, "module_key");

  if (!projectKey || !moduleKey) {
    redirect("/");
  }

  const supabase = createAthenaCoreClient();

  const { error } = await supabase
    .from("athena_project_modules")
    .update({
      status: "archived",
      estimated_remaining_hours: 0,
      notes: readFormValue(formData, "notes") || null
    })
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey);

  if (error) {
    redirect(`/projects/${projectKey}/modules?error=${encodeURIComponent(error.message)}`);
  }

  await regenerateDailyBriefingSafe();

  redirect(`/projects/${projectKey}/modules?success=${encodeURIComponent("Module archived")}`);
}

export async function deleteAthenaProjectModule(formData: FormData) {
  const projectKey = readFormValue(formData, "project_key");
  const moduleKey = readFormValue(formData, "module_key");
  const confirmation = readFormValue(formData, "delete_confirmation");

  if (!projectKey || !moduleKey) {
    redirect("/");
  }

  if (confirmation !== moduleKey) {
    redirect(`/projects/${projectKey}/modules?error=${encodeURIComponent("To delete, type the exact module key first")}`);
  }

  const supabase = createAthenaCoreClient();

  const { error } = await supabase
    .from("athena_project_modules")
    .delete()
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey);

  if (error) {
    redirect(`/projects/${projectKey}/modules?error=${encodeURIComponent(error.message)}`);
  }

  await regenerateDailyBriefingSafe();

  redirect(`/projects/${projectKey}/modules?success=${encodeURIComponent("Module deleted")}`);
}