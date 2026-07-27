import type {
  CanonicalBuildLifecycleResult,
} from "@/lib/build-lifecycle/types";
import { createAthenaCoreClient } from "@/lib/supabase/server";

export type BuildLifecycleAutomaticCheck = {
  checkKey: string;
  passed: boolean;
  evidence: Record<string, unknown>;
};

export type BuildLifecycleAutomaticEvidence = {
  status: "pass" | "fail";
  checks: BuildLifecycleAutomaticCheck[];
};

export async function readBuildLifecycleAutomaticEvidence(
  expected: CanonicalBuildLifecycleResult,
): Promise<BuildLifecycleAutomaticEvidence> {
  const supabase = createAthenaCoreClient();
  const [stateResult, transitionResult, openTimerResult] = await Promise.all([
    supabase
      .from("athena_build_lifecycle_state")
      .select("*")
      .eq("id", expected.state_id)
      .single(),
    supabase
      .from("athena_build_lifecycle_transitions")
      .select("*")
      .eq("id", expected.transition_id)
      .single(),
    supabase
      .from("athena_build_timer_sessions")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "paused", "idle"]),
  ]);

  const state = stateResult.data as Record<string, unknown> | null;
  const transition =
    transitionResult.data as Record<string, unknown> | null;
  const checks: BuildLifecycleAutomaticCheck[] = [
    {
      checkKey: "state_read_succeeded",
      passed: !stateResult.error && state !== null,
      evidence: { error: stateResult.error?.message || null },
    },
    {
      checkKey: "transition_read_succeeded",
      passed: !transitionResult.error && transition !== null,
      evidence: { error: transitionResult.error?.message || null },
    },
    {
      checkKey: "state_identity_matches",
      passed:
        state?.build_id === expected.build_id &&
        state?.build_title === expected.build_title &&
        state?.operation_key === expected.operation_key &&
        state?.request_hash === expected.request_hash,
      evidence: {
        expectedBuildId: expected.build_id,
        actualBuildId: state?.build_id || null,
      },
    },
    {
      checkKey: "transition_identity_matches",
      passed:
        transition?.build_id === expected.build_id &&
        transition?.operation_key === expected.operation_key &&
        transition?.request_hash === expected.request_hash,
      evidence: {
        expectedTransitionId: expected.transition_id,
        actualTransitionId: transition?.id || null,
      },
    },
    {
      checkKey: "no_implicit_timer_start",
      passed: !openTimerResult.error && openTimerResult.count === 0,
      evidence: {
        openTimerCount: openTimerResult.count,
        error: openTimerResult.error?.message || null,
      },
    },
    {
      checkKey: "result_side_effect_flags_false",
      passed:
        expected.timer_started === false &&
        expected.qa_created === false &&
        expected.completion_created === false &&
        expected.build_log_created === false,
      evidence: {
        timerStarted: expected.timer_started,
        qaCreated: expected.qa_created,
        completionCreated: expected.completion_created,
        buildLogCreated: expected.build_log_created,
      },
    },
  ];

  return {
    status: checks.every((check) => check.passed) ? "pass" : "fail",
    checks,
  };
}
