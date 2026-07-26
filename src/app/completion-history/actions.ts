"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function encodeMessage(value: string) {
  return encodeURIComponent(value);
}

function computeQaStatus(checkList: { status: string }[]) {
  return checkList.some((check) => check.status === "fail")
    ? "fail"
    : checkList.some((check) => check.status === "pending")
      ? "pending"
      : checkList.some((check) => check.status === "warning")
        ? "warning"
        : checkList.length > 0
          ? "pass"
          : "draft";
}

export async function repairCompletionEvent(formData: FormData) {
  const supabase = createAthenaCoreClient();

  const eventId = readText(formData, "event_id");

  if (!eventId) {
    redirect(`/completion-history?error=${encodeMessage("Missing completion event id.")}`);
  }

  const { data: event, error: eventError } = await supabase
    .from("athena_feature_completion_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    redirect(`/completion-history?error=${encodeMessage("Could not find completion event.")}`);
  }

  const { data: existingBuildLog } = await supabase
    .from("athena_build_logs")
    .select("session_title, created_at")
    .eq("product_key", event.project_key)
    .eq("session_title", event.build_session_title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existingBuildLog) {
    const { error: retryError } = await supabase
      .from("athena_feature_completion_events")
      .update({
        status: "retry_ready",
        cto_recorded: false,
        memory_check_closed: false,
        notes: "Repair check found no Athena CTO build log. Event was marked retry_ready so the CTO update can be safely retried from /complete-feature.",
        updated_at: new Date().toISOString()
      })
      .eq("id", event.id);

    if (retryError) {
      redirect(`/completion-history?error=${encodeMessage(retryError.message)}`);
    }

    redirect(
      `/completion-history?recorded=cto_not_recorded&message=${encodeMessage(
        "No CTO build log found. Event marked retry_ready."
      )}`
    );
  }

  let memoryClosed = false;

  if (event.qa_run_id) {
    const { error: memoryError } = await supabase
      .from("athena_qa_check_results")
      .update({
        status: "pass",
        actual_result: `${event.build_session_title} was repaired after confirming the Athena CTO build log already exists.`,
        notes: "Repair workflow marked memory check pass because the matching CTO build log was found.",
        updated_at: new Date().toISOString()
      })
      .eq("qa_run_id", event.qa_run_id)
      .eq("check_key", "athena_cto_memory_recorded");

    if (memoryError) {
      redirect(`/completion-history?error=${encodeMessage(memoryError.message)}`);
    }

    const { data: checkList } = await supabase
      .from("athena_qa_check_results")
      .select("status")
      .eq("qa_run_id", event.qa_run_id);

    if (checkList) {
      const computedStatus = computeQaStatus(checkList);

      await supabase
        .from("athena_qa_runs")
        .update({
          status: computedStatus
        })
        .eq("id", event.qa_run_id);
    }

    memoryClosed = true;
  }

  const { error: completionError } = await supabase
    .from("athena_feature_completion_events")
    .update({
      status: memoryClosed ? "completed" : "needs_review",
      cto_recorded: true,
      memory_check_closed: memoryClosed,
      notes: memoryClosed
        ? "Repair workflow confirmed CTO build log exists and closed the memory QA check."
        : "Repair workflow confirmed CTO build log exists, but no QA run was linked. Manual review is needed.",
      updated_at: new Date().toISOString()
    })
    .eq("id", event.id);

  if (completionError) {
    redirect(`/completion-history?error=${encodeMessage(completionError.message)}`);
  }

  redirect(
    `/completion-history?message=${encodeMessage(
      memoryClosed
        ? "Completion event repaired and memory check closed."
        : "CTO log found, but QA run was missing. Event needs review."
    )}`
  );
}