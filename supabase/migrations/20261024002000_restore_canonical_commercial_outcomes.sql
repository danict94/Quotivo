-- QF-042B correction: a restored local archive must project the existing
-- canonical commercial outcome, never infer it from a share or UI fallback.
create or replace function public.get_quote_restore_snapshot()
returns table(kind text, quote_id text, version bigint, created_at timestamptz,
  updated_at timestamptz, deleted_at timestamptz, payload jsonb)
language sql security definer set search_path = '' as $$
  select 'ISSUED'::text, issuance.client_quote_id, 1::bigint,
    snapshot.created_at, snapshot.created_at, null::timestamptz,
    jsonb_build_object(
      'issuanceId', issuance.id,
      'snapshot', snapshot.snapshot_json,
      'commercialOutcome', coalesce(outcome.outcome, 'PENDING'),
      'commercialOutcomeSource', outcome.source,
      'commercialOutcomeDecidedAt', outcome.decided_at
    )
  from public.quote_issuances issuance
  inner join public.quote_issuance_snapshots snapshot on snapshot.quote_issuance_id = issuance.id
  left join public.quote_commercial_outcomes outcome on outcome.quote_issuance_id = issuance.id
  where issuance.user_id = auth.uid()
  union all
  select 'DRAFT'::text, draft.quote_id, draft.version, draft.created_at,
    draft.updated_at, draft.deleted_at, draft.draft_json
  from public.quote_draft_projections draft
  where draft.owner_user_id = auth.uid();
$$;

revoke all on function public.get_quote_restore_snapshot() from public, anon;
grant execute on function public.get_quote_restore_snapshot() to authenticated;
