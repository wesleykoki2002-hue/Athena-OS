# Build 0090 implementation/function manifest

Build owner: `0090`
Module owner: `project-memory`

## Governed revisions

- Production implementation commit: `8308febdaa742737d770f5cf737ad77912679d73`
- Production implementation tree: `da74281af95645d8d53c6c91d8ffabec12fbafcc`
- QA fixture-isolation correction commit: `310fa25bc65f4243da169c4127d926eae2ea8649`
- QA fixture-isolation correction tree: `b272de62a7bc265f6cccfa55ce82cc284f2f0cb0`
- Final evidence commit: the commit containing this manifest; intentionally not self-embedded because a commit cannot contain its own hash. Its exact hash/tree are verified as final remote evidence.

## File evidence

| File | SHA-256 |
|---|---|
| `supabase/migrations/20260903113000_0090_intake_preparation_chain_supersession.sql` | `a227ddf9854012077311e8df8c5878e34587dc9434122007b7ee62311332c1a9` |
| `supabase/tests/20260903113001_0090_intake_preparation_chain_supersession_automatic_qa.sql` | `2047d41886ce120d2eee22cd3cf0ec304385cec26745a59279e95a6bde0df1d5` |
| `docs/governance/0090-intake-preparation-chain-supersession.md` | `1ebbd30ec1493418d5b79cf5c149ed2e569be3f224510d64139bb4ce836570f1` |

## Production objects

| Type | Object | Change | Responsibility | Associated QA |
|---|---|---|---|---|
| Table | `public.athena_intake_preparation_supersessions` | New | Append-only authoritative original-to-replacement lineage | QA-08–QA-16 |
| Index | `athena_intake_preparation_supersessions_identity_idx` | New | Deterministic project/module/external-build lookup | QA-14, QA-17 |
| Trigger function | `public.prevent_athena_intake_preparation_supersession_mutation` | New | Reject mutation of supersession evidence | QA-15 |
| Trigger | `trg_athena_intake_preparation_supersessions_immutable` | New | Reject row UPDATE/DELETE | QA-15 |
| Trigger | `trg_athena_intake_preparation_supersessions_no_truncate` | New | Reject table truncation | QA-15 |
| Internal resolver | `public.athena_resolve_intake_preparation_supersession` | New | Resolve one exact replacement lineage | QA-14, QA-17 |
| Privileged RPC | `public.athena_supersede_intake_preparation_chain` | New | Validate invariants and append idempotent supersession evidence | QA-02–QA-10, QA-13–QA-16 |
| Function/RPC | `public.athena_pre_build_collect_candidates` | Modified | Exclude only an exact recorded predecessor for its exact replacement | QA-01, QA-11, QA-12, QA-17 |
| Function/RPC | `public.athena_pre_build_gate_preview` | Modified | Add deterministic supersession lineage to gate scope/evidence | QA-17 |
| Function/RPC | `public.athena_build_lifecycle_assign_and_start` | Modified | Exclude only the exact original package from replacement collision counting and persist lineage | QA-17 |

The table has 16 deployed constraints covering keys, endpoint uniqueness, foreign keys, distinct-chain identity, external identity, operation format, provenance shape, and required text. Row-level security is enabled. Direct table writes are revoked from public roles and `service_role`; only `service_role` can execute the governed supersession RPC. The two database triggers enforce append-only evidence.

Downstream completion, automatic-QA, timer, and build-log readers modified: none. They already bind to the selected immutable lifecycle transition and preparation package.

Application-layer production function count: `0`.

## Canonical deployment and QA

- Canonical Athena project: `voiwlcvfahykdldtjeqy`
- Migration version: `20260903113000`
- Migration history row verified: `1`
- Supersession table, RPC, candidate collector, gate preview, and lifecycle assignment definitions verified after deployment.
- Canonical automatic QA: `17/17 passed`
- QA execution boundary: transaction-isolated `BEGIN / DO / ROLLBACK`
- QA fixture residue: `0`
- Live supersession rows after QA: `0`
- Live BDNA-GOV-0001 supersession created: `false`
- Live BDNA-GOV-0001 replacement created: `false`
- Real malformed preparation `a9ad0030-f91c-4381-b522-f64b62b59d04` remained unchanged and queryable.
- Remote implementation commit/tree verification: passed.

The QA-only correction changed no production migration or runtime function. It projects the real candidate-collector output onto deterministic synthetic fixture IDs only for classification assertions, preventing unrelated canonical records from contaminating the test while preserving production fail-closed semantics.
