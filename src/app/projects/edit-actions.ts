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

export async function updateAthenaProject(formData: FormData) {
  const projectKey = readFormValue(formData, "project_key");

  if (!projectKey) {
    redirect("/");
  }

  const supabase = createAthenaCoreClient();

  const updatePayload = {
    name: readFormValue(formData, "name"),
    short_name: readFormValue(formData, "short_name") || null,
    status: readFormValue(formData, "status") || "working",
    priority: readFormValue(formData, "priority") || "P1",
    progress_percent: readNumber(formData, "progress_percent"),
    estimated_total_hours: readNumber(formData, "estimated_total_hours"),
    hours_spent: readNumber(formData, "hours_spent"),
    estimated_remaining_hours: readNumber(formData, "estimated_remaining_hours"),
    business_value_score: readNumber(formData, "business_value_score"),
    technical_complexity_score: readNumber(formData, "technical_complexity_score"),
    revenue_potential_score: readNumber(formData, "revenue_potential_score"),
    urgency_score: readNumber(formData, "urgency_score"),
    closest_to_launch: readBoolean(formData, "closest_to_launch"),
    revenue_ready: readBoolean(formData, "revenue_ready"),
    blocked: readBoolean(formData, "blocked"),
    blocker_summary: readFormValue(formData, "blocker_summary") || null,
    notes: readFormValue(formData, "notes") || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("athena_projects")
    .update(updatePayload)
    .eq("project_key", projectKey);

  if (error) {
    redirect(`/projects/${projectKey}/edit?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.rpc("generate_athena_daily_command_center");

  redirect(`/projects/${projectKey}`);
}