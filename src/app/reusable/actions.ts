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

function readList(formData: FormData, key: string) {
  return readFormValue(formData, key)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function updateReusableComponent(formData: FormData) {
  const componentKey = readFormValue(formData, "component_key");

  if (!componentKey) {
    redirect("/reusable?error=Missing component key");
  }

  const supabase = createAthenaCoreClient();

  const updatePayload = {
    name: readFormValue(formData, "name"),
    description: readFormValue(formData, "description"),
    source_project_key: readFormValue(formData, "source_project_key") || null,
    component_type: readFormValue(formData, "component_type"),
    status: readFormValue(formData, "status"),
    reusable_in_projects: readList(formData, "reusable_in_projects"),
    estimated_hours_saved: readNumber(formData, "estimated_hours_saved"),
    notes: readFormValue(formData, "notes") || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("athena_reusable_components")
    .update(updatePayload)
    .eq("component_key", componentKey)
    .select("component_key, notes, updated_at")
    .maybeSingle();

  if (error) {
    redirect(`/reusable/${componentKey}/edit?error=${encodeURIComponent(error.message)}`);
  }

  if (!data) {
    redirect(`/reusable/${componentKey}/edit?error=${encodeURIComponent("Update returned zero rows. Check RLS policy, grants, or component_key.")}`);
  }

  const { error: briefingError } = await supabase.rpc("generate_athena_daily_command_center");

  if (briefingError) {
    redirect(`/reusable/${componentKey}?warning=${encodeURIComponent("Component updated, but Daily Briefing did not refresh: " + briefingError.message)}`);
  }

  redirect(`/reusable/${componentKey}?success=${encodeURIComponent("Reusable component updated")}`);
}