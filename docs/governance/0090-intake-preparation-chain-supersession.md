# Build 0090: Intake/preparation chain supersession

Build 0090 repairs a fail-closed recovery deadlock without rewriting approved evidence. A malformed external-build Intake/preparation chain remains immutable and queryable; a privileged, append-only supersession record identifies its one exact corrected replacement.

The authority is `public.athena_intake_preparation_supersessions`, created only through `athena_supersede_intake_preparation_chain`. Project, module, preparation ownership, approval evidence, external build ID, replacement title prefix, pre-lifecycle status, operator, reason, and operation identity are validated transactionally. Identical replay is idempotent; contradictory replay, self-links, missing chains, cross-project/module links, incompatible identities, reused graph endpoints, and direct table mutations fail closed.

Candidate collection omits only the exact original package when evaluating the exact recorded replacement. Gate evidence includes deterministic supersession lineage. Lifecycle collision counting excludes only that original package/replacement pair; any unrelated or third duplicate remains a collision. Existing completion, QA, timer, and build-log readers already resolve the selected immutable lifecycle transition and therefore need no change.

The motivating fixture is BDNA-GOV-0001: the predecessor title omitted the required `BDNA-GOV-0001 ` prefix while the replacement has the canonical title. Build 0090 does not mutate or supersede the live BeautyDNA evidence. The real relationship requires separate post-deployment owner authorization.

Out of scope: mutable approved titles, generic metadata bypasses, broad duplicate suppression, preparation versioning, lifecycle singleton/timer redesign, and application-layer feature work.
