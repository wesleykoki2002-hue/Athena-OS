"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFeatureType(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function saveQaPrefillTemplate(formData: FormData) {
  const supabase = createAthenaCoreClient();

  const originalFeatureType = readText(formData, "original_feature_type");
  const rawFeatureType = readText(formData, "feature_type");
  const featureType = normalizeFeatureType(rawFeatureType);

  const templateName = readText(formData, "template_name");
  const description = readText(formData, "description");
  const status = readText(formData, "status") || "draft";
  const checkDefaultsText = readText(formData, "check_defaults_text") || "{}";

  const returnPath = originalFeatureType
    ? `/qa-prefill-templates/${encodeURIComponent(originalFeatureType)}/edit`
    : "/qa-prefill-templates/new";

  if (!featureType || !templateName || !description) {
    redirect(`${returnPath}?error=${encodeURIComponent("Feature type, template name, and description are required.")}`);
  }

  let checkDefaults: unknown;

  try {
    checkDefaults = JSON.parse(checkDefaultsText);
  } catch {
    redirect(`${returnPath}?error=${encodeURIComponent("Check defaults must be valid JSON.")}`);
  }

  if (
    typeof checkDefaults !== "object" ||
    checkDefaults === null ||
    Array.isArray(checkDefaults)
  ) {
    redirect(`${returnPath}?error=${encodeURIComponent("Check defaults must be a JSON object.")}`);
  }

  if (originalFeatureType) {
    const { error } = await supabase
      .from("athena_qa_prefill_templates")
      .update({
        template_name: templateName,
        description,
        status,
        check_defaults: checkDefaults,
        updated_at: new Date().toISOString()
      })
      .eq("feature_type", originalFeatureType);

    if (error) {
      redirect(`${returnPath}?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    const { error } = await supabase
      .from("athena_qa_prefill_templates")
      .insert({
        feature_type: featureType,
        template_name: templateName,
        description,
        status,
        check_defaults: checkDefaults
      });

    if (error) {
      redirect(`${returnPath}?error=${encodeURIComponent(error.message)}`);
    }
  }

  redirect("/qa-prefill-templates");
}
export async function archiveQaPrefillTemplate(formData: FormData) {
  const supabase = createAthenaCoreClient();

  const featureType = readText(formData, "feature_type");

  if (!featureType) {
    redirect("/qa-prefill-templates?error=Missing feature type.");
  }

  const { error } = await supabase
    .from("athena_qa_prefill_templates")
    .update({
      status: "deprecated",
      updated_at: new Date().toISOString()
    })
    .eq("feature_type", featureType);

  if (error) {
    redirect(`/qa-prefill-templates/${encodeURIComponent(featureType)}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/qa-prefill-templates");
}

export async function deleteQaPrefillTemplate(formData: FormData) {
  const supabase = createAthenaCoreClient();

  const featureType = readText(formData, "feature_type");
  const confirmation = readText(formData, "delete_confirmation");

  if (!featureType) {
    redirect("/qa-prefill-templates?error=Missing feature type.");
  }

  if (confirmation !== featureType) {
    redirect(
      `/qa-prefill-templates/${encodeURIComponent(featureType)}/edit?error=${encodeURIComponent(
        "Delete confirmation did not match the feature type. No template was deleted."
      )}`
    );
  }

  const { error } = await supabase
    .from("athena_qa_prefill_templates")
    .delete()
    .eq("feature_type", featureType);

  if (error) {
    redirect(`/qa-prefill-templates/${encodeURIComponent(featureType)}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/qa-prefill-templates");
}