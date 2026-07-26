"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";

function readFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function saveDatabaseChange(formData: FormData) {
  const changeName = readFormValue(formData, "change_name");
  const manualChangeKey = readFormValue(formData, "change_key");
  const projectKey = readFormValue(formData, "project_key");
  const moduleKey = readFormValue(formData, "module_key");
  const buildSessionTitle = readFormValue(formData, "build_session_title");
  const changeType = readFormValue(formData, "change_type");
  const objectType = readFormValue(formData, "object_type");
  const objectName = readFormValue(formData, "object_name");
  const status = readFormValue(formData, "status");
  const description = readFormValue(formData, "description");
  const rollbackNotes = readFormValue(formData, "rollback_notes");
  const securityNotes = readFormValue(formData, "security_notes");
  const testNotes = readFormValue(formData, "test_notes");

  if (!changeName || !projectKey || !changeType || !objectType || !objectName || !status) {
    redirect(`/database-changes/new?error=${encodeURIComponent("Change name, project, change type, object type, object name, and status are required.")}`);
  }

  const changeKey = manualChangeKey || slugify(changeName);

  if (!changeKey) {
    redirect(`/database-changes/new?error=${encodeURIComponent("Could not create a valid change key.")}`);
  }

  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase
    .from("athena_database_changes")
    .upsert(
      {
        change_key: changeKey,
        change_name: changeName,
        project_key: projectKey,
        module_key: moduleKey || null,
        build_session_title: buildSessionTitle || null,
        change_type: changeType,
        object_type: objectType,
        object_name: objectName,
        status,
        description: description || null,
        rollback_notes: rollbackNotes || null,
        security_notes: securityNotes || null,
        test_notes: testNotes || null,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "change_key"
      }
    )
    .select("change_key")
    .maybeSingle<{ change_key: string }>();

  if (error) {
    redirect(`/database-changes/new?error=${encodeURIComponent(error.message)}`);
  }

  if (!data) {
    redirect(`/database-changes/new?error=${encodeURIComponent("Database change save returned zero rows.")}`);
  }

  redirect(`/database-changes?success=${encodeURIComponent("Database change saved: " + data.change_key)}`);
}