-- QF-030B2 corrective migration: output-column names must not shadow the
-- unique-key column names used by the idempotent insert.
create or replace function public.start_job(p_issuance_id uuid)
returns table(
  job_id uuid, owner_user_id uuid, source_root_issuance_id uuid, source_issuance_id uuid,
  source_revision_number integer, client_name text, title text, quoted_amount_cents bigint,
  currency text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_cap record;
  v_job public.jobs%rowtype;
  v_snapshot public.quote_issuance_snapshots%rowtype;
begin
  perform public.assert_account_active();
  lock table public.quote_issuances in share mode;
  select * into v_cap from public.resolve_job_capability_internal(p_issuance_id, v_user_id);
  if v_cap.capability = 'OPEN' then
    return query select v_cap.job_id, v_cap.owner_user_id, v_cap.source_root_issuance_id,
      v_cap.source_issuance_id, v_cap.source_revision_number, v_cap.client_name, v_cap.title,
      v_cap.quoted_amount_cents, v_cap.currency, v_cap.status, v_cap.created_at;
    return;
  end if;
  if v_cap.capability <> 'START' then
    raise exception 'JOB_START_NOT_ALLOWED:%', coalesce(v_cap.reason, 'UNKNOWN') using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_cap.source_root_issuance_id::text));
  select * into v_cap from public.resolve_job_capability_internal(p_issuance_id, v_user_id);
  if v_cap.capability = 'OPEN' then
    return query select v_cap.job_id, v_cap.owner_user_id, v_cap.source_root_issuance_id,
      v_cap.source_issuance_id, v_cap.source_revision_number, v_cap.client_name, v_cap.title,
      v_cap.quoted_amount_cents, v_cap.currency, v_cap.status, v_cap.created_at;
    return;
  end if;
  if v_cap.capability <> 'START' then
    raise exception 'JOB_START_NOT_ALLOWED:%', coalesce(v_cap.reason, 'UNKNOWN') using errcode = 'P0001';
  end if;

  select snapshot.* into v_snapshot
  from public.quote_issuance_snapshots snapshot
  where snapshot.quote_issuance_id = v_cap.source_issuance_id
    and snapshot.owner_user_id = v_user_id;
  if v_snapshot.quote_issuance_id is null then
    raise exception 'JOB_START_NOT_ALLOWED:SNAPSHOT_MISSING' using errcode = 'P0001';
  end if;

  insert into public.jobs (
    owner_user_id, source_root_issuance_id, source_issuance_id, source_revision_number,
    client_name, title, quoted_amount_cents, currency
  ) values (
    v_user_id, v_cap.source_root_issuance_id, v_cap.source_issuance_id, v_cap.source_revision_number,
    v_snapshot.client_name, v_snapshot.title, v_snapshot.quoted_amount_cents, v_snapshot.currency
  ) on conflict on constraint jobs_owner_user_id_source_root_issuance_id_key do nothing
  returning * into v_job;

  if v_job.id is null then
    select job.* into v_job from public.jobs job
    where job.owner_user_id = v_user_id and job.source_root_issuance_id = v_cap.source_root_issuance_id;
  end if;
  return query select v_job.id, v_job.owner_user_id, v_job.source_root_issuance_id,
    v_job.source_issuance_id, v_job.source_revision_number, v_job.client_name, v_job.title,
    v_job.quoted_amount_cents, v_job.currency, v_job.status, v_job.created_at;
end;
$$;
