"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";
import { computeQaStatus } from "@/lib/qa-status";
import { applyAutomaticQaEvidence } from "@/lib/qa/automatic-evidence";
import type { CompletionPacket } from "@/lib/completion-packets";

function readFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readCheckbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function qaErrorUrl(runId: string, message: string) {
  return `/qa/${runId}?error=${encodeURIComponent(message)}`;
}

function qaSuccessUrl(runId: string, message: string) {
  return `/qa/${runId}?success=${encodeURIComponent(message)}`;
}

function packetErrorUrl(packetId: string, message: string) {
  return `/complete-feature?packet_id=${encodeURIComponent(
    packetId
  )}&error=${encodeURIComponent(message)}`;
}

type QaTemplateCheck = {
  check_key?: string;
  check_name?: string;
  category?: string;
  status?: string;
  severity?: string;
  expected_result?: string;
};

type QaCheckStatusRow = {
  status: string;
  warning_acknowledged_at: string | null;
};

const allowedQaStatuses = new Set([
  "pending",
  "not_applicable",
  "pass",
  "warning",
  "fail"
]);

export async function createQaRun(formData: FormData) {
  const packetId = readFormValue(formData, "packet_id");
  const templateKey =
    readFormValue(formData, "template_key") ||
    "athena-feature-completion-gate-v1";

  const supabase = createAthenaCoreClient();

  let packet: CompletionPacket | null = null;
  let projectKey = readFormValue(formData, "project_key");
  let moduleKey = readFormValue(formData, "module_key");
  let featureName = readFormValue(formData, "feature_name");
  let routePath = readFormValue(formData, "route_path");
  let buildSessionTitle = readFormValue(
    formData,
    "build_session_title"
  );
  let summary = readFormValue(formData, "summary");

  if (packetId) {
    const { data, error } = await supabase
      .from("athena_feature_completion_packets")
      .select("*")
      .eq("id", packetId)
      .maybeSingle<CompletionPacket>();

    if (error || !data) {
      redirect(
        `/complete-feature?error=${encodeURIComponent(
          error?.message || "Completion packet was not found."
        )}`
      );
    }

    packet = data;

    if (
      packet.status === "completed" ||
      packet.status === "cancelled"
    ) {
      redirect(
        packetErrorUrl(
          packet.id,
          `QA cannot be created from a ${packet.status} packet.`
        )
      );
    }

    if (packet.qa_run_id) {
      let result;

      try {
        result =
          await applyAutomaticQaEvidence({
            supabase,
            packet,
            qaRunId: packet.qa_run_id
          });
      } catch (error) {
        redirect(
          qaErrorUrl(
            packet.qa_run_id,
            error instanceof Error
              ? error.message
              : "Automatic QA evidence refresh failed."
          )
        );
      }

      redirect(
        qaSuccessUrl(
          packet.qa_run_id,
          `Automatic QA evidence refreshed and verified: ${result.updated_check_keys.length} checks updated.`
        )
      );
    }

    projectKey = packet.project_key;
    moduleKey = packet.module_key;
    featureName = packet.feature_name;
    routePath = packet.route_path || "";
    buildSessionTitle = packet.build_session_title;
    summary = packet.summary || "";
  }

  if (
    !projectKey ||
    !moduleKey ||
    !featureName ||
    !templateKey ||
    !buildSessionTitle
  ) {
    const message =
      "Canonical project, module key, feature name, build session title, and template are required.";

    if (packetId) {
      redirect(packetErrorUrl(packetId, message));
    }

    redirect(`/qa/new?error=${encodeURIComponent(message)}`);
  }

  const { data: moduleRow, error: moduleError } = await supabase
    .from("athena_project_modules")
    .select("project_key, module_key")
    .eq("project_key", projectKey)
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (moduleError || !moduleRow) {
    const message = `Module ${moduleKey} is not registered under canonical project ${projectKey}.`;

    if (packetId) {
      redirect(packetErrorUrl(packetId, message));
    }

    redirect(`/qa/new?error=${encodeURIComponent(message)}`);
  }

  const { data: template, error: templateError } = await supabase
    .from("athena_qa_templates")
    .select("template_key, checklist")
    .eq("template_key", templateKey)
    .maybeSingle<{
      template_key: string;
      checklist: QaTemplateCheck[] | null;
    }>();

  if (templateError) {
    const message = templateError.message;

    if (packetId) {
      redirect(packetErrorUrl(packetId, message));
    }

    redirect(`/qa/new?error=${encodeURIComponent(message)}`);
  }

  if (!template) {
    const message = "QA template not found.";

    if (packetId) {
      redirect(packetErrorUrl(packetId, message));
    }

    redirect(`/qa/new?error=${encodeURIComponent(message)}`);
  }

  const now = new Date();
  const qaRunKey = `${projectKey}-${slugify(
    featureName
  )}-${now.getTime()}`;

  const { data: run, error: runError } = await supabase
    .from("athena_qa_runs")
    .insert({
      qa_run_key: qaRunKey,
      project_key: projectKey,
      module_key: moduleKey,
      feature_name: featureName,
      route_path: routePath || null,
      template_key: templateKey,
      build_session_title: buildSessionTitle,
      status: "pending",
      summary: summary || null,
      started_at: now.toISOString()
    })
    .select(
      "id, project_key, module_key, feature_name, route_path, build_session_title"
    )
    .maybeSingle<{
      id: string;
      project_key: string;
      module_key: string | null;
      feature_name: string;
      route_path: string | null;
      build_session_title: string | null;
    }>();

  if (runError || !run) {
    const message =
      runError?.message || "QA run insert returned zero rows.";

    if (packetId) {
      redirect(packetErrorUrl(packetId, message));
    }

    redirect(`/qa/new?error=${encodeURIComponent(message)}`);
  }

  if (
    run.project_key !== projectKey ||
    run.module_key !== moduleKey ||
    run.feature_name !== featureName ||
    run.route_path !== (routePath || null) ||
    run.build_session_title !== buildSessionTitle
  ) {
    await supabase.from("athena_qa_runs").delete().eq("id", run.id);

    const message = "QA run returned-row verification failed.";

    if (packetId) {
      redirect(packetErrorUrl(packetId, message));
    }

    redirect(`/qa/new?error=${encodeURIComponent(message)}`);
  }

  const checklist = Array.isArray(template.checklist)
    ? template.checklist
    : [];

  const checkRows = checklist.map((check) => ({
    qa_run_id: run.id,
    check_key: String(check.check_key || "unknown-check"),
    check_name: String(check.check_name || "Unnamed check"),
    category: String(check.category || "general"),
    status: "pending",
    severity: String(check.severity || "medium"),
    expected_result: String(check.expected_result || ""),
    actual_result: null,
    evidence: {},
    notes: null,
    warning_acknowledged_at: null,
    warning_acknowledged_by: null,
    warning_acknowledgement_notes: null
  }));

  if (checkRows.length > 0) {
    const { data: insertedChecks, error: checksError } =
      await supabase
        .from("athena_qa_check_results")
        .insert(checkRows)
        .select("id, check_key, status");

    if (
      checksError ||
      !insertedChecks ||
      insertedChecks.length !== checkRows.length
    ) {
      await supabase.from("athena_qa_runs").delete().eq("id", run.id);

      const message =
        "QA checklist insert failed: " +
        (checksError?.message ||
          `Expected ${checkRows.length} rows but received ${
            insertedChecks?.length ?? 0
          }.`);

      if (packetId) {
        redirect(packetErrorUrl(packetId, message));
      }

      redirect(`/qa/new?error=${encodeURIComponent(message)}`);
    }
  }

  if (packet) {
    const { data: savedPacket, error: packetUpdateError } =
      await supabase
        .from("athena_feature_completion_packets")
        .update({
          qa_run_id: run.id,
          status: "qa_in_progress"
        })
        .eq("id", packet.id)
        .is("qa_run_id", null)
        .select("id, qa_run_id, status")
        .maybeSingle<{
          id: string;
          qa_run_id: string | null;
          status: string;
        }>();

    if (
      packetUpdateError ||
      !savedPacket ||
      savedPacket.qa_run_id !== run.id ||
      savedPacket.status !== "qa_in_progress"
    ) {
      await supabase.from("athena_qa_runs").delete().eq("id", run.id);

      redirect(
        packetErrorUrl(
          packet.id,
          packetUpdateError?.message ||
            "Completion packet could not be linked to the verified QA run."
        )
      );
    }
  }

  if (packet) {
    let result;

    try {
      result =
        await applyAutomaticQaEvidence({
          supabase,
          packet,
          qaRunId: run.id
        });
    } catch (error) {
      redirect(
        qaErrorUrl(
          run.id,
          error instanceof Error
            ? error.message
            : "QA run was created, but automatic evidence generation failed."
        )
      );
    }

    redirect(
      qaSuccessUrl(
        run.id,
        `QA run created and automatic evidence verified: ${result.updated_check_keys.length} checks updated.`
      )
    );
  }

  redirect(`/qa/${run.id}`);
}

export async function updateQaCheckResult(formData: FormData) {
  const runId = readFormValue(formData, "qa_run_id");
  const checkId = readFormValue(formData, "check_id");
  const status =
    readFormValue(formData, "status") || "pending";
  const actualResult = readFormValue(
    formData,
    "actual_result"
  );
  const notes = readFormValue(formData, "notes");
  const warningAcknowledged = readCheckbox(
    formData,
    "warning_acknowledged"
  );
  const warningAcknowledgedBy = readFormValue(
    formData,
    "warning_acknowledged_by"
  );
  const warningAcknowledgementNotes = readFormValue(
    formData,
    "warning_acknowledgement_notes"
  );

  if (!runId || !checkId) {
    redirect("/qa");
  }

  if (!allowedQaStatuses.has(status)) {
    redirect(
      qaErrorUrl(
        runId,
        `Unsupported QA status: ${status}`
      )
    );
  }

  const supabase = createAthenaCoreClient();

  const { data: existingCheck, error: existingCheckError } =
    await supabase
      .from("athena_qa_check_results")
      .select(
        "id, qa_run_id, status, warning_acknowledged_at"
      )
      .eq("id", checkId)
      .eq("qa_run_id", runId)
      .maybeSingle<{
        id: string;
        qa_run_id: string;
        status: string;
        warning_acknowledged_at: string | null;
      }>();

  if (existingCheckError || !existingCheck) {
    redirect(
      qaErrorUrl(
        runId,
        existingCheckError?.message ||
          "QA check was not found under this QA run."
      )
    );
  }

  if (
    status === "warning" &&
    warningAcknowledged &&
    (!warningAcknowledgedBy ||
      !warningAcknowledgementNotes)
  ) {
    redirect(
      qaErrorUrl(
        runId,
        "Acknowledged warnings require both Acknowledged by and Acknowledgement notes."
      )
    );
  }

  const acknowledgementPayload =
    status === "warning" && warningAcknowledged
      ? {
          warning_acknowledged_at:
            existingCheck.warning_acknowledged_at ||
            new Date().toISOString(),
          warning_acknowledged_by:
            warningAcknowledgedBy,
          warning_acknowledgement_notes:
            warningAcknowledgementNotes
        }
      : {
          warning_acknowledged_at: null,
          warning_acknowledged_by: null,
          warning_acknowledgement_notes: null
        };

  const { data: savedCheck, error } = await supabase
    .from("athena_qa_check_results")
    .update({
      status,
      actual_result: actualResult || null,
      notes: notes || null,
      ...acknowledgementPayload,
      updated_at: new Date().toISOString()
    })
    .eq("id", checkId)
    .eq("qa_run_id", runId)
    .select(
      "id, qa_run_id, status, actual_result, notes, warning_acknowledged_at, warning_acknowledged_by, warning_acknowledgement_notes"
    )
    .maybeSingle<{
      id: string;
      qa_run_id: string;
      status: string;
      actual_result: string | null;
      notes: string | null;
      warning_acknowledged_at: string | null;
      warning_acknowledged_by: string | null;
      warning_acknowledgement_notes: string | null;
    }>();

  if (error || !savedCheck) {
    redirect(
      qaErrorUrl(
        runId,
        error?.message ||
          "QA check update returned zero rows."
      )
    );
  }

  const expectedAcknowledgementAt =
    acknowledgementPayload.warning_acknowledged_at;

  if (
    savedCheck.status !== status ||
    savedCheck.actual_result !==
      (actualResult || null) ||
    savedCheck.notes !== (notes || null) ||
    savedCheck.warning_acknowledged_at !==
      expectedAcknowledgementAt ||
    savedCheck.warning_acknowledged_by !==
      acknowledgementPayload.warning_acknowledged_by ||
    savedCheck.warning_acknowledgement_notes !==
      acknowledgementPayload.warning_acknowledgement_notes
  ) {
    redirect(
      qaErrorUrl(
        runId,
        "QA check read-after-write verification failed."
      )
    );
  }

  await supabase
    .from("athena_feature_completion_packets")
    .update({
      status: "qa_in_progress"
    })
    .eq("qa_run_id", runId)
    .in("status", [
      "draft",
      "qa_in_progress",
      "ready_to_record",
      "retry_ready"
    ]);

  redirect(
    qaSuccessUrl(
      runId,
      "QA check updated and verified."
    )
  );
}

export async function completeQaRun(formData: FormData) {
  const runId = readFormValue(formData, "qa_run_id");

  if (!runId) {
    redirect("/qa");
  }

  const supabase = createAthenaCoreClient();

  const { data: checks, error: checksError } =
    await supabase
      .from("athena_qa_check_results")
      .select("status, warning_acknowledged_at")
      .eq("qa_run_id", runId)
      .returns<QaCheckStatusRow[]>();

  if (checksError) {
    redirect(qaErrorUrl(runId, checksError.message));
  }

  const checkList = checks || [];
  const computedStatus = computeQaStatus(checkList);
  const now = new Date().toISOString();
  const completedAt =
    computedStatus === "pass" ||
    computedStatus === "fail"
      ? now
      : null;

  const { data: savedRun, error } = await supabase
    .from("athena_qa_runs")
    .update({
      status: computedStatus,
      completed_at: completedAt,
      updated_at: now
    })
    .eq("id", runId)
    .select("id, status, completed_at")
    .maybeSingle<{
      id: string;
      status: string;
      completed_at: string | null;
    }>();

  if (
    error ||
    !savedRun ||
    savedRun.status !== computedStatus ||
    savedRun.completed_at !== completedAt
  ) {
    redirect(
      qaErrorUrl(
        runId,
        error?.message ||
          "QA run status read-after-write verification failed."
      )
    );
  }

  const packetStatus =
    computedStatus === "pass"
      ? "ready_to_record"
      : "qa_in_progress";

  const { error: packetError } = await supabase
    .from("athena_feature_completion_packets")
    .update({
      status: packetStatus
    })
    .eq("qa_run_id", runId)
    .in("status", [
      "draft",
      "qa_in_progress",
      "ready_to_record",
      "retry_ready"
    ]);

  if (packetError) {
    redirect(
      qaErrorUrl(
        runId,
        `QA status was saved, but the completion packet status could not be synchronized: ${packetError.message}`
      )
    );
  }

  redirect(
    qaSuccessUrl(
      runId,
      `QA run status updated to ${computedStatus}.`
    )
  );
}
