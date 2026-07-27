import "server-only";

import {
  readTimerOperatorSession,
} from "@/lib/auth/require-timer-operator-session";

export type LifecycleOperatorIdentity = {
  operatorKey: string;
  operatorDisplayName: null;
};

export async function requireLifecycleOperatorSession():
  Promise<LifecycleOperatorIdentity> {
  const session = await readTimerOperatorSession();

  if (!session) {
    throw new Error(
      "Signed operator session is required for canonical build lifecycle execution.",
    );
  }

  const operatorKey = session.operator_key.trim();

  if (!operatorKey) {
    throw new Error(
      "Signed operator session did not contain a canonical operator key.",
    );
  }

  return {
    operatorKey,
    operatorDisplayName: null,
  };
}
