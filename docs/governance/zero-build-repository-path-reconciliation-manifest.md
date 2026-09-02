# Zero-build repository-path reconciliation manifest

- Ownership: Athena control plane / zero-build governance repair.
- Production migration: `supabase/migrations/20260902010000_zero_build_intake_repository_path_metadata_reconciliation.sql`.
- Production RPC: `public.athena_reconcile_intake_repository_path_metadata(uuid,uuid,text,text,text,text,text,text,jsonb)`.
- Responsibility: reconcile only `athena_intake_preparation_packages.metadata.repository_path` before gate, lifecycle, timer, or completion evidence exists, while preserving unrelated state and recording structured provenance.
- Database objects changed: one new RPC only. No tables, columns, triggers, or historical rows are added or rewritten.
- Security: `SECURITY DEFINER`, fixed `pg_catalog, public` search path, execute granted only to `service_role`; direct table update remains denied.
- Automatic QA: `supabase/tests/20260902010001_zero_build_intake_repository_path_metadata_reconciliation_automatic_qa.sql`.
- Authorization boundary deviation preserved: the 0090 handoff was created and registered before explicit handoff authorization. Disposition: `preserve_valid_evidence_and_record_deviation`.
- Build 0090 preparation invocation is excluded from this repair and requires separate owner authorization.
- Implementation commit, final tree, migration SHA-256, and deployment evidence are populated by the verified Git/deployment record.
