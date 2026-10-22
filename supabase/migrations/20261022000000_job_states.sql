-- QF-031: remote-authoritative Job lifecycle. Existing OPEN Jobs become ACTIVE.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs alter column status drop default;
update public.jobs set status = 'ACTIVE' where status = 'OPEN';
alter table public.jobs alter column status set default 'ACTIVE';
alter table public.jobs add constraint jobs_status_check check (status in ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'));
alter table public.jobs add column started_at timestamptz;
alter table public.jobs add column completed_at timestamptz;
alter table public.jobs add column cancelled_at timestamptz;
alter table public.jobs add column updated_at timestamptz;
update public.jobs set started_at = created_at, updated_at = created_at where started_at is null or updated_at is null;
alter table public.jobs alter column started_at set not null;
alter table public.jobs alter column updated_at set not null;
alter table public.jobs add constraint jobs_completed_at_state_check check ((status = 'COMPLETED') = (completed_at is not null));
alter table public.jobs add constraint jobs_cancelled_at_state_check check ((status = 'CANCELLED') = (cancelled_at is not null));

-- Preserve the proven QF-030 capability/start implementation privately, then expose
-- contracts that include the canonical lifecycle timestamps.
alter function public.resolve_job_capability(uuid) rename to resolve_job_capability_legacy;
alter function public.start_job(uuid) rename to start_job_legacy;
revoke all on function public.resolve_job_capability_legacy(uuid) from public, anon, authenticated;
revoke all on function public.start_job_legacy(uuid) from public, anon, authenticated;

create function public.resolve_job_capability(p_issuance_id uuid)
returns table(
  capability text, reason text, job_id uuid, owner_user_id uuid,
  source_root_issuance_id uuid, source_issuance_id uuid, source_revision_number integer,
  client_name text, title text, quoted_amount_cents bigint, currency text, status text,
  created_at timestamptz, started_at timestamptz, completed_at timestamptz,
  cancelled_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select legacy.capability, legacy.reason, legacy.job_id, legacy.owner_user_id,
    legacy.source_root_issuance_id, legacy.source_issuance_id, legacy.source_revision_number,
    legacy.client_name, legacy.title, legacy.quoted_amount_cents, legacy.currency, legacy.status,
    job.created_at, job.started_at, job.completed_at, job.cancelled_at, job.updated_at
  from public.resolve_job_capability_legacy(p_issuance_id) legacy
  left join public.jobs job on job.id = legacy.job_id;
$$;

create function public.start_job(p_issuance_id uuid)
returns table(
  job_id uuid, owner_user_id uuid, source_root_issuance_id uuid, source_issuance_id uuid,
  source_revision_number integer, client_name text, title text, quoted_amount_cents bigint,
  currency text, status text, created_at timestamptz, started_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select legacy.job_id, legacy.owner_user_id, legacy.source_root_issuance_id,
    legacy.source_issuance_id, legacy.source_revision_number, legacy.client_name,
    legacy.title, legacy.quoted_amount_cents, legacy.currency, legacy.status,
    job.created_at, job.started_at, job.completed_at, job.cancelled_at, job.updated_at
  from public.start_job_legacy(p_issuance_id) legacy
  join public.jobs job on job.id = legacy.job_id;
$$;

create function public.transition_job_status(p_job_id uuid, p_target_status text)
returns table(
  job_id uuid, owner_user_id uuid, source_root_issuance_id uuid, source_issuance_id uuid,
  source_revision_number integer, client_name text, title text, quoted_amount_cents bigint,
  currency text, status text, created_at timestamptz, started_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict error
declare
  v_job public.jobs%rowtype;
begin
  perform public.assert_account_active();
  select job.* into v_job
  from public.jobs job
  where job.id = p_job_id and job.owner_user_id = auth.uid()
  for update;
  if v_job.id is null then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_target_status not in ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED') then
    raise exception 'JOB_STATUS_INVALID' using errcode = 'P0001';
  end if;
  -- A retried command is a no-op and preserves all server timestamps.
  if v_job.status = p_target_status then
    return query select v_job.id, v_job.owner_user_id, v_job.source_root_issuance_id,
      v_job.source_issuance_id, v_job.source_revision_number, v_job.client_name, v_job.title,
      v_job.quoted_amount_cents, v_job.currency, v_job.status, v_job.created_at,
      v_job.started_at, v_job.completed_at, v_job.cancelled_at, v_job.updated_at;
    return;
  end if;
  if not ((v_job.status = 'ACTIVE' and p_target_status in ('PAUSED', 'COMPLETED', 'CANCELLED'))
    or (v_job.status = 'PAUSED' and p_target_status in ('ACTIVE', 'COMPLETED', 'CANCELLED'))) then
    raise exception 'JOB_STATUS_TRANSITION_NOT_ALLOWED:%:%', v_job.status, p_target_status using errcode = 'P0001';
  end if;

  update public.jobs job set
    status = p_target_status,
    completed_at = case when p_target_status = 'COMPLETED' then now() else null end,
    cancelled_at = case when p_target_status = 'CANCELLED' then now() else null end,
    updated_at = now()
  where job.id = v_job.id
  returning job.* into v_job;
  return query select v_job.id, v_job.owner_user_id, v_job.source_root_issuance_id,
    v_job.source_issuance_id, v_job.source_revision_number, v_job.client_name, v_job.title,
    v_job.quoted_amount_cents, v_job.currency, v_job.status, v_job.created_at,
    v_job.started_at, v_job.completed_at, v_job.cancelled_at, v_job.updated_at;
end;
$$;

revoke all on function public.resolve_job_capability(uuid) from public, anon;
revoke all on function public.start_job(uuid) from public, anon;
revoke all on function public.transition_job_status(uuid, text) from public, anon;
grant execute on function public.resolve_job_capability(uuid) to authenticated;
grant execute on function public.start_job(uuid) to authenticated;
grant execute on function public.transition_job_status(uuid, text) to authenticated;
