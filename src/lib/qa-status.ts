export type QaOverallStatus =
  | "draft"
  | "pending"
  | "warning"
  | "fail"
  | "pass";

export type QaStatusCheck = {
  status: string;
  warning_acknowledged_at?: string | null;
};

export function warningIsAcknowledged(check: QaStatusCheck) {
  return check.status === "warning" && Boolean(check.warning_acknowledged_at);
}

export function computeQaStatus(checks: QaStatusCheck[]): QaOverallStatus {
  if (checks.length === 0) return "draft";
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "pending")) return "pending";

  if (
    checks.some(
      (check) =>
        check.status === "warning" &&
        !warningIsAcknowledged(check)
    )
  ) {
    return "warning";
  }

  return "pass";
}
