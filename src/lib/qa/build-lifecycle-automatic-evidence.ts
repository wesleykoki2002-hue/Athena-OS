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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function readBuildLifecycleAutomaticEvidence(
  expected: CanonicalBuildLifecycleResult,
): Promise<BuildLifecycleAutomaticEvidence> {
  const supabase = createAthenaCoreClient();
  const [stateResult, transitionResult, exactTimerResult, gateResult] =
    await Promise.all([
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
        .select("id, status, created_at")
        .eq("project_key", expected.project_key)
        .eq("module_key", expected.module_key)
        .eq("build_session_title", expected.build_title),
      supabase.rpc("athena_pre_build_gate_read_qa_evidence", {
        p_evaluation_id: expected.gate_evaluation_id,
      }),
    ]);

  const state = stateResult.data as Record<string, unknown> | null;
  const transition =
    transitionResult.data as Record<string, unknown> | null;
  const gate = asRecord(gateResult.data);
  const evaluation = asRecord(gate?.evaluation);
  const override = asRecord(gate?.override);
  const candidateCount = Number(gate?.candidate_count ?? -1);
  const gateIdentityMatches =
    evaluation?.id === expected.gate_evaluation_id &&
    evaluation?.operation_key === expected.operation_key &&
    evaluation?.scope_hash === expected.gate_scope_hash &&
    evaluation?.request_hash === expected.gate_request_hash &&
    evaluation?.classification === expected.gate_classification &&
    evaluation?.intake_id === expected.intake_id &&
    evaluation?.preparation_package_id === expected.preparation_package_id &&
    evaluation?.project_key === expected.project_key &&
    evaluation?.module_key === expected.module_key &&
    evaluation?.module_id === expected.module_id &&
    evaluation?.repository_head === expected.repository_head &&
    evaluation?.handoff_sha256 === expected.handoff_sha256;
  const decisionAllowsStart =
    expected.gate_decision === "pass"
      ? evaluation?.decision === "pass" && override === null
      : evaluation?.decision === "block" &&
        Boolean(override) &&
        override?.evaluation_id === expected.gate_evaluation_id &&
        override?.operation_key === expected.operation_key &&
        override?.scope_hash === expected.gate_scope_hash;
  const transitionLinkedByOperation =
    gate?.linked_transition_id === expected.transition_id;
  const exactTimers = Array.isArray(exactTimerResult.data)
    ? exactTimerResult.data.filter(
        (timer): timer is {
          id: string;
          status: string;
          created_at: string;
        } =>
          Boolean(timer) &&
          typeof timer.id === "string" &&
          typeof timer.status === "string" &&
          typeof timer.created_at === "string",
      )
    : [];
  const transitionCreatedAt =
    typeof transition?.created_at === "string"
      ? Date.parse(transition.created_at)
      : Number.NaN;
  const exactTimersAreLater =
    exactTimers.length === 0 ||
    (Number.isFinite(transitionCreatedAt) &&
      exactTimers.every((timer) => {
        const timerCreatedAt = Date.parse(timer.created_at);
        return (
          Number.isFinite(timerCreatedAt) &&
          timerCreatedAt > transitionCreatedAt
        );
      }));

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
        state?.build_number === expected.build_number &&
        state?.build_id === expected.build_id &&
        state?.build_title === expected.build_title &&
        state?.assignment_method === expected.assignment_method &&
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
        transition?.build_number === expected.build_number &&
        transition?.build_id === expected.build_id &&
        transition?.build_title === expected.build_title &&
        transition?.assignment_method === expected.assignment_method &&
        transition?.operation_key === expected.operation_key &&
        transition?.request_hash === expected.request_hash,
      evidence: {
        expectedTransitionId: expected.transition_id,
        actualTransitionId: transition?.id || null,
      },
    },
    {
      checkKey: "build_identity_mode_matches",
      passed:
        (expected.build_identity_kind === "numeric" &&
          expected.build_number !== null &&
          expected.numeric_sequence_consumed === true &&
          expected.build_id ===
            String(expected.build_number).padStart(4, "0")) ||
        (expected.build_identity_kind === "external" &&
          expected.build_number === null &&
          expected.numeric_sequence_consumed === false &&
          /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(expected.build_id)),
      evidence: {
        buildIdentityKind: expected.build_identity_kind,
        buildNumber: expected.build_number,
        buildId: expected.build_id,
        numericSequenceCandidateId:
          expected.numeric_sequence_candidate_id,
        numericSequenceConsumed: expected.numeric_sequence_consumed,
      },
    },
    {
      checkKey: "target_supabase_evidence_matches",
      passed: Boolean(
        state?.evidence &&
        typeof state.evidence === "object" &&
        !Array.isArray(state.evidence) &&
        (state.evidence as Record<string, unknown>)
          .target_supabase_project_ref ===
          expected.target_supabase_project_ref &&
        transition?.request_evidence &&
        typeof transition.request_evidence === "object" &&
        !Array.isArray(transition.request_evidence) &&
        (transition.request_evidence as Record<string, unknown>)
          .target_supabase_project_ref ===
          expected.target_supabase_project_ref,
      ),
      evidence: {
        expectedTargetSupabaseProjectRef:
          expected.target_supabase_project_ref,
      },
    },
    {
      checkKey: "gate_evidence_read_succeeded",
      passed: !gateResult.error && gate !== null && evaluation !== null,
      evidence: { error: gateResult.error?.message || null },
    },
    {
      checkKey: "gate_identity_matches",
      passed: gateIdentityMatches,
      evidence: {
        expectedEvaluationId: expected.gate_evaluation_id,
        actualEvaluationId: evaluation?.id || null,
        expectedScopeHash: expected.gate_scope_hash,
        actualScopeHash: evaluation?.scope_hash || null,
      },
    },
    {
      checkKey: "gate_candidate_evidence_persisted",
      passed:
        Number.isInteger(candidateCount) &&
        candidateCount >= 0 &&
        candidateCount === expected.gate_candidate_count,
      evidence: {
        expectedCandidateCount: expected.gate_candidate_count,
        actualCandidateCount: candidateCount,
      },
    },
    {
      checkKey: "gate_decision_authorized_start",
      passed: decisionAllowsStart,
      evidence: {
        expectedDecision: expected.gate_decision,
        persistedDecision: evaluation?.decision || null,
        overrideId: override?.id || null,
      },
    },
    {
      checkKey: "historical_lifecycle_rpc_compatibility_preserved",
      passed: gate?.old_rpc_service_role_execute === true,
      evidence: {
        oldRpcServiceRoleExecute:
          gate?.old_rpc_service_role_execute ?? null,
      },
    },
    {
      checkKey: "database_transition_gate_enforced",
      passed:
        gate?.transition_gate_trigger_exists === true &&
        transitionLinkedByOperation,
      evidence: {
        transitionGateTriggerExists:
          gate?.transition_gate_trigger_exists ?? null,
        linkedTransitionId:
          gate?.linked_transition_id ?? null,
        expectedTransitionId:
          expected.transition_id,
      },
    },
    {
      checkKey: "gate_wrapper_service_role_executable",
      passed: gate?.wrapper_service_role_execute === true,
      evidence: {
        wrapperServiceRoleExecute:
          gate?.wrapper_service_role_execute ?? null,
      },
    },
    {
      checkKey: "no_implicit_timer_start",
      passed: !exactTimerResult.error && exactTimersAreLater,
      evidence: {
        exactTimerCount: exactTimers.length,
        exactTimers,
        transitionCreatedAt:
          typeof transition?.created_at === "string"
            ? transition.created_at
            : null,
        allExactTimersCreatedAfterTransition: exactTimersAreLater,
        error: exactTimerResult.error?.message || null,
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
