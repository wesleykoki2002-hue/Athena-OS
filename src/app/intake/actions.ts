"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readLines(formData: FormData, key: string) {
  return readText(formData, key)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildIntakeUrl(input: {
  projectKey?: string;
  error?: string;
  success?: string;
}) {
  const params = new URLSearchParams();

  if (input.projectKey) {
    params.set("project_key", input.projectKey);
  }

  if (input.error) {
    params.set("error", input.error);
  }

  if (input.success) {
    params.set("success", input.success);
  }

  const query = params.toString();
  return query ? `/intake?${query}` : "/intake";
}

async function verifyCanonicalProjectModule(
  projectKey: string,
  moduleKey: string
) {
  const supabase = createAthenaCoreClient();

  const { data: project, error: projectError } = await supabase
    .from("athena_projects")
    .select("project_key")
    .eq("project_key", projectKey)
    .maybeSingle<{ project_key: string }>();

  if (projectError || !project) {
    return {
      ok: false as const,
      error: "The selected project is not in public.athena_projects."
    };
  }

  const { data: module, error: moduleError } = await supabase
    .from("athena_project_modules")
    .select("project_key, module_key")
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey)
    .maybeSingle<{
      project_key: string;
      module_key: string;
    }>();

  if (moduleError || !module) {
    return {
      ok: false as const,
      error:
        "The selected module is not registered for the selected project in public.athena_project_modules."
    };
  }

  return { ok: true as const };
}

export async function createAthenaIntakeItem(formData: FormData) {
  const projectKey = readText(formData, "project_key");
  const moduleKey = readText(formData, "module_key");
  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const sourceType = readText(formData, "source_type");
  const sourceReference = readText(formData, "source_reference");
  const submittedBy = readText(formData, "submitted_by");

  if (
    !projectKey ||
    !moduleKey ||
    !title ||
    !description ||
    !sourceType
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Project, module, title, description, and source type are required."
      })
    );
  }

  const ownership = await verifyCanonicalProjectModule(
    projectKey,
    moduleKey
  );

  if (!ownership.ok) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: ownership.error
      })
    );
  }

  const intakeKey = `athena-intake-${randomUUID()}`;
  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase.rpc(
    "create_athena_intake_item",
    {
      target_intake_key: intakeKey,
      target_project_key: projectKey,
      target_module_key: moduleKey,
      target_title: title,
      target_description: description,
      target_source_type: sourceType,
      target_source_reference: sourceReference || null,
      target_submitted_by: submittedBy || null,
      target_metadata: {
        created_from: "athena-os-intake-ui"
      }
    }
  );

  if (error) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: error.message
      })
    );
  }

  if (!data) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "Intake creation returned no record."
      })
    );
  }

  revalidatePath("/intake");

  redirect(
    buildIntakeUrl({
      projectKey,
      success: "Intake item captured and placed into pending review."
    })
  );
}

export async function ingestAthenaConversationCandidate(
  formData: FormData
) {
  const projectKey = readText(formData, "project_key");
  const moduleKey = readText(formData, "module_key");
  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const sourceType = readText(formData, "source_type");
  const sourceReference = readText(formData, "source_reference");
  const submittedBy = readText(formData, "submitted_by");
  const candidateCategory = readText(formData, "candidate_category");
  const extractionKind = readText(formData, "extraction_kind");
  const confidenceText = readText(formData, "extraction_confidence");
  const evidenceText = readText(formData, "evidence_text");
  const missingInformation = readLines(
    formData,
    "missing_information"
  );

  if (
    !projectKey ||
    !moduleKey ||
    !title ||
    !description ||
    !sourceType ||
    !sourceReference ||
    !candidateCategory ||
    !extractionKind ||
    !confidenceText ||
    !evidenceText
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Project, module, candidate details, source reference, extraction details, confidence, and supporting evidence are required."
      })
    );
  }

  const extractionConfidence = Number(confidenceText);

  if (
    !Number.isFinite(extractionConfidence) ||
    extractionConfidence < 0 ||
    extractionConfidence > 1
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "Extraction confidence must be a number from 0 to 1."
      })
    );
  }

  const allowedSourceTypes = new Set([
    "pasted_conversation",
    "chatgpt_export",
    "project_chat_summary",
    "uploaded_source_file",
    "authorized_connector_source"
  ]);

  if (!allowedSourceTypes.has(sourceType)) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The selected conversation source type is not supported."
      })
    );
  }

  const allowedCategories = new Set([
    "feature_request",
    "improvement",
    "reusable_system",
    "decision",
    "risk",
    "unresolved_idea",
    "roadmap_candidate",
    "missing_capability",
    "technical_debt",
    "cross_project_reuse",
    "other"
  ]);

  if (!allowedCategories.has(candidateCategory)) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The selected candidate category is not supported."
      })
    );
  }

  const allowedExtractionKinds = new Set([
    "explicit_request",
    "inferred_suggestion"
  ]);

  if (!allowedExtractionKinds.has(extractionKind)) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The extraction kind must be explicit or inferred."
      })
    );
  }

  const ownership = await verifyCanonicalProjectModule(
    projectKey,
    moduleKey
  );

  if (!ownership.ok) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: ownership.error
      })
    );
  }

  const supabase = createAthenaCoreClient();

  const { data, error } = await supabase.rpc(
    "ingest_athena_intake_conversation_candidate",
    {
      target_project_key: projectKey,
      target_module_key: moduleKey,
      target_title: title,
      target_description: description,
      target_source_type: sourceType,
      target_source_reference: sourceReference,
      target_submitted_by: submittedBy || null,
      target_candidate_category: candidateCategory,
      target_extraction_kind: extractionKind,
      target_extraction_confidence: extractionConfidence,
      target_evidence_text: evidenceText,
      target_evidence_locator: {
        input_mode: "operator_reviewed_text",
        route_path: "/intake"
      },
      target_missing_information: missingInformation,
      target_extraction_method: "operator_reviewed_manual",
      target_extraction_version: "0082-v1",
      target_metadata: {
        created_from: "athena-os-intake-conversation-research-ui",
        operator_reviewed: true,
        source_authorized_by_operator: true
      }
    }
  );

  if (error) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: error.message
      })
    );
  }

  const result = data as
    | {
        candidate_result?: string;
        evidence_result?: string;
        status_key?: string;
      }
    | null;

  if (!result) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "Conversation candidate ingestion returned no result."
      })
    );
  }

  if (
    result.candidate_result === "inserted" &&
    result.status_key !== "pending_review"
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Conversation candidate ingestion did not preserve pending review."
      })
    );
  }

  const candidateOutcome =
    result.candidate_result === "duplicate"
      ? "linked to the existing canonical intake item"
      : "created as a pending-review intake item";

  const evidenceOutcome =
    result.evidence_result === "existing"
      ? "Existing evidence was preserved."
      : "New append-only evidence was recorded.";

  revalidatePath("/intake");

  redirect(
    buildIntakeUrl({
      projectKey,
      success: `Conversation candidate ${candidateOutcome}. ${evidenceOutcome}`
    })
  );
}

export async function reviewAthenaIntakeItem(formData: FormData) {
  const intakeId = readText(formData, "intake_id");
  const projectKey = readText(formData, "project_key");
  const targetStatusKey = readText(formData, "target_status_key");
  const reviewer = readText(formData, "reviewed_by");
  const decisionNotes = readText(formData, "decision_notes");

  if (
    !intakeId ||
    !projectKey ||
    !targetStatusKey ||
    !reviewer ||
    !decisionNotes
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Intake item, decision, reviewer, and decision notes are required."
      })
    );
  }

  const supabase = createAthenaCoreClient();

  const { data: existingItem, error: itemError } = await supabase
    .from("athena_intake_items")
    .select("id, project_key, status_key")
    .eq("id", intakeId)
    .maybeSingle<{
      id: string;
      project_key: string;
      status_key: string;
    }>();

  if (itemError || !existingItem) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The intake item was not found."
      })
    );
  }

  if (existingItem.project_key !== projectKey) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The intake item does not belong to the selected project."
      })
    );
  }

  const { data: currentStatus, error: currentStatusError } =
    await supabase
      .from("athena_intake_statuses")
      .select("status_key, is_initial")
      .eq("status_key", existingItem.status_key)
      .maybeSingle<{
        status_key: string;
        is_initial: boolean;
      }>();

  if (
    currentStatusError ||
    !currentStatus ||
    !currentStatus.is_initial
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "Duplicate review blocked. This intake was already reviewed."
      })
    );
  }

  const { data: decisionStatus, error: decisionStatusError } =
    await supabase
      .from("athena_intake_statuses")
      .select("status_key, review_outcome")
      .eq("status_key", targetStatusKey)
      .eq("is_active", true)
      .not("review_outcome", "is", null)
      .maybeSingle<{
        status_key: string;
        review_outcome: string;
      }>();

  if (decisionStatusError || !decisionStatus) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The selected intake decision is not active or valid."
      })
    );
  }

  const { data, error } = await supabase.rpc(
    "review_athena_intake_item",
    {
      target_intake_id: intakeId,
      target_status_key: targetStatusKey,
      target_reviewer: reviewer,
      target_decision_notes: decisionNotes,
      target_metadata: {
        reviewed_from: "athena-os-intake-ui"
      }
    }
  );

  if (error) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: error.message
      })
    );
  }

  if (!data) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "Intake review returned no history record."
      })
    );
  }

  revalidatePath("/intake");

  redirect(
    buildIntakeUrl({
      projectKey,
      success: `Intake decision recorded: ${decisionStatus.review_outcome}.`
    })
  );
}

export async function createAthenaIntakePreparationPackage(
  formData: FormData
) {
  const intakeId = readText(formData, "intake_id");
  const projectKey = readText(formData, "project_key");
  const packageTitle = readText(formData, "package_title");
  const proposedBuildId = readText(formData, "proposed_build_id");
  const proposedBuildTitle = readText(
    formData,
    "proposed_build_title"
  );
  const objective = readText(formData, "objective");
  const handoffVersion = readText(formData, "handoff_version");
  const handoffFilename = readText(formData, "handoff_filename");

  if (
    !intakeId ||
    !projectKey ||
    !packageTitle ||
    !objective ||
    !handoffVersion ||
    !handoffFilename
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Intake item, package title, objective, canonical handoff version, and canonical handoff filename are required."
      })
    );
  }

  const hasBuildId = Boolean(proposedBuildId);
  const hasBuildTitle = Boolean(proposedBuildTitle);

  if (hasBuildId !== hasBuildTitle) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Proposed build ID and proposed build title must be provided together or both left blank."
      })
    );
  }

  if (
    handoffFilename.includes("/") ||
    handoffFilename.includes("\\")
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Canonical handoff filename must be a filename only and cannot contain directory separators."
      })
    );
  }
  const supabase = createAthenaCoreClient();

  const { data: intakeItem, error: intakeError } = await supabase
    .from("athena_intake_items")
    .select("id, project_key, status_key")
    .eq("id", intakeId)
    .maybeSingle<{
      id: string;
      project_key: string;
      status_key: string;
    }>();

  if (intakeError || !intakeItem) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The intake item was not found."
      })
    );
  }

  if (intakeItem.project_key !== projectKey) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "The intake item does not belong to the selected project."
      })
    );
  }

  const { data: approvedStatus, error: statusError } =
    await supabase
      .from("athena_intake_statuses")
      .select("status_key, allows_preparation")
      .eq("status_key", intakeItem.status_key)
      .eq("is_active", true)
      .maybeSingle<{
        status_key: string;
        allows_preparation: boolean;
      }>();

  if (
    statusError ||
    !approvedStatus ||
    !approvedStatus.allows_preparation
  ) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "A preparation package can be created only for an approved intake item."
      })
    );
  }

  const { data: existingPackage, error: packageReadError } =
    await supabase
      .from("athena_intake_preparation_packages")
      .select("id")
      .eq("intake_id", intakeId)
      .maybeSingle<{ id: string }>();

  if (packageReadError) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Could not verify whether a preparation package already exists."
      })
    );
  }

  if (existingPackage) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error:
          "Duplicate preparation package blocked. This intake already has one."
      })
    );
  }

  const packageKey = `athena-intake-package-${randomUUID()}`;

  const { data, error } = await supabase.rpc(
    "create_athena_intake_preparation_package",
    {
      target_intake_id: intakeId,
      target_package_key: packageKey,
      target_package_title: packageTitle,
      target_proposed_build_id: proposedBuildId || null,
      target_proposed_build_title: proposedBuildTitle || null,
      target_objective: objective,
      target_acceptance_criteria: readLines(
        formData,
        "acceptance_criteria"
      ),
      target_dependencies: readLines(formData, "dependencies"),
      target_risks: readLines(formData, "risks"),
      target_security_notes: readLines(
        formData,
        "security_notes"
      ),
      target_missing_information: readLines(
        formData,
        "missing_information"
      ),
      target_metadata: {
        created_from: "athena-os-intake-ui",
        automatic_build_card_created: false,
        handoff_version: handoffVersion,
        handoff_filename: handoffFilename
      }
    }
  );

  if (error) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: error.message
      })
    );
  }

  if (!data) {
    redirect(
      buildIntakeUrl({
        projectKey,
        error: "Preparation package creation returned no record."
      })
    );
  }

  revalidatePath("/intake");

  redirect(
    buildIntakeUrl({
      projectKey,
      success:
        "Preparation package created. No build card or next-step record was created."
    })
  );
}
