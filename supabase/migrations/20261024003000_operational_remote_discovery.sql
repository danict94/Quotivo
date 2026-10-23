-- QF-042C: one owner-scoped, read-only discovery snapshot for data that is
-- already remote-authoritative. It deliberately omits public-link tokens.
create function public.get_operational_restore_snapshot()
returns table(kind text, payload jsonb)
language sql security definer set search_path = '' as $$
  select 'SHARE'::text, jsonb_build_object(
    'id', share_row.id, 'issuanceId', share_row.quote_issuance_id,
    'lifecycle', share_row.lifecycle, 'openedAt', share_row.opened_at,
    'createdAt', share_row.created_at
  )
  from public.quote_shares share_row
  where share_row.owner_user_id = auth.uid()
  union all
  select 'JOB'::text, jsonb_build_object(
    'id', job.id, 'ownerUserId', job.owner_user_id,
    'sourceRootIssuanceId', job.source_root_issuance_id,
    'sourceIssuanceId', job.source_issuance_id,
    'sourceRevisionNumber', job.source_revision_number,
    'clientName', job.client_name, 'title', job.title,
    'quotedAmountCents', job.quoted_amount_cents, 'currency', job.currency,
    'status', job.status, 'createdAt', job.created_at, 'startedAt', job.started_at,
    'completedAt', job.completed_at, 'cancelledAt', job.cancelled_at, 'updatedAt', job.updated_at
  ) from public.jobs job where job.owner_user_id = auth.uid()
  union all
  select 'JOB_COST'::text, jsonb_build_object(
    'id', cost.id, 'ownerUserId', cost.owner_user_id, 'jobId', cost.job_id,
    'requestKey', cost.request_key, 'category', cost.category,
    'description', cost.description, 'amountCents', cost.amount_cents,
    'occurredAt', cost.occurred_at, 'workerLabel', cost.worker_label,
    'createdAt', cost.created_at, 'updatedAt', cost.updated_at
  ) from public.job_cost_entries cost where cost.owner_user_id = auth.uid()
  union all
  select 'JOB_WORK'::text, jsonb_build_object(
    'id', work.id, 'ownerUserId', work.owner_user_id, 'jobId', work.job_id,
    'requestKey', work.request_key, 'personLabel', work.person_label,
    'role', work.role, 'workDate', work.work_date,
    'durationMinutes', work.duration_minutes, 'costCents', work.cost_cents,
    'note', work.note, 'createdAt', work.created_at, 'updatedAt', work.updated_at
  ) from public.job_work_entries work where work.owner_user_id = auth.uid()
  union all
  select 'ISSUANCE_MISSING_SNAPSHOT'::text, jsonb_build_object(
    'issuanceId', issuance.id
  ) from public.quote_issuances issuance
  left join public.quote_issuance_snapshots snapshot on snapshot.quote_issuance_id = issuance.id
    and snapshot.owner_user_id = issuance.user_id
  where issuance.user_id = auth.uid() and snapshot.quote_issuance_id is null;
$$;

revoke all on function public.get_operational_restore_snapshot() from public, anon;
grant execute on function public.get_operational_restore_snapshot() to authenticated;
