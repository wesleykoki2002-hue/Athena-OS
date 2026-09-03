# Build 0090 implementation/function manifest

Build owner: `0090`  
Module owner: `project-memory`

| Type | Object | Change | Responsibility | Migration | Tests |
|---|---|---|---|---|---|
| Table | `public.athena_intake_preparation_supersessions` | New | Immutable authoritative chain lineage | `supabase/migrations/20260903113000_0090_intake_preparation_chain_supersession.sql` | `supabase/tests/20260903113001_0090_intake_preparation_chain_supersession_automatic_qa.sql` |
| Trigger function | `public.prevent_athena_intake_preparation_supersession_mutation` | New | Reject UPDATE/DELETE/TRUNCATE | same | same |
| Resolver function | `public.athena_resolve_intake_preparation_supersession` | New internal | Resolve exact replacement lineage | same | same |
| RPC | `public.athena_supersede_intake_preparation_chain` | New privileged | Validate and append canonical supersession | same | same |
| RPC | `public.athena_pre_build_collect_candidates` | Modified | Exclude only exact predecessor for exact replacement | same | same |
| RPC | `public.athena_pre_build_gate_preview` | Modified | Include deterministic supersession lineage | same | same |
| RPC | `public.athena_build_lifecycle_assign_and_start` | Modified | Narrow exact-pair collision exception and persist lineage | same | same |

Downstream completion/QA/log readers modified: none; they bind to the selected lifecycle transition and package.

Application-layer production changes: zero.

Implementation commit: pending.  
Final tree: pending.  
File SHA-256 evidence: pending.  
Remote verification: pending.
