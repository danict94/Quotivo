-- Removes the redundant declaration shadowed by the integer FOR loop.
-- The capability contract, SECURITY DEFINER boundary, owner filtering and grants stay unchanged.
create or replace function public.resolve_job_capability_internal(
  p_issuance_id uuid,
  p_owner_user_id uuid
)
returns table(
  capability text,
  reason text,
  job_id uuid,
  owner_user_id uuid,
  source_root_issuance_id uuid,
  source_issuance_id uuid,
  source_revision_number integer,
  client_name text,
  title text,
  quoted_amount_cents bigint,
  currency text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_source public.quote_issuances%rowtype;
  v_root public.quote_issuances%rowtype;
  v_cursor public.quote_issuances%rowtype;
  v_parent public.quote_issuances%rowtype;
  v_job public.jobs%rowtype;
begin
  select issuance.* into v_source
  from public.quote_issuances issuance
  where issuance.id = p_issuance_id
    and issuance.user_id = p_owner_user_id;
  if v_source.id is null then
    return query select 'ERROR'::text, 'ISSUANCE_NOT_FOUND'::text,
      null::uuid, null::uuid, null::uuid, null::uuid, null::integer,
      null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_source.revision_number = 0 then
    if v_source.revision_root_issuance_id is not null or v_source.parent_issuance_id is not null then
      return query select 'ERROR'::text, 'INVALID_LINEAGE'::text,
        null::uuid, null::uuid, null::uuid, null::uuid, null::integer,
        null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
      return;
    end if;
    v_root := v_source;
  else
    select issuance.* into v_root
    from public.quote_issuances issuance
    where issuance.id = v_source.revision_root_issuance_id
      and issuance.user_id = p_owner_user_id;
    if v_root.id is null or v_root.revision_number <> 0
      or v_root.revision_root_issuance_id is not null or v_root.parent_issuance_id is not null then
      return query select 'ERROR'::text, 'INVALID_LINEAGE'::text,
        null::uuid, null::uuid, null::uuid, null::uuid, null::integer,
        null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
      return;
    end if;
  end if;

  -- Walk every direct parent to reject gaps, forks and malformed ancestry.
  v_cursor := v_source;
  for v_expected in reverse 0..v_source.revision_number loop
    if v_cursor.id is null or v_cursor.user_id <> p_owner_user_id
      or v_cursor.revision_number <> v_expected then
      return query select 'ERROR'::text, 'INVALID_LINEAGE'::text,
        null::uuid, null::uuid, null::uuid, null::uuid, null::integer,
        null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
      return;
    end if;
    if v_expected = 0 then
      if v_cursor.id <> v_root.id or v_cursor.revision_root_issuance_id is not null
        or v_cursor.parent_issuance_id is not null then
        return query select 'ERROR'::text, 'INVALID_LINEAGE'::text,
          null::uuid, null::uuid, null::uuid, null::uuid, null::integer,
          null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
        return;
      end if;
    else
      if v_cursor.revision_root_issuance_id <> v_root.id or v_cursor.parent_issuance_id is null then
        return query select 'ERROR'::text, 'INVALID_LINEAGE'::text,
          null::uuid, null::uuid, null::uuid, null::uuid, null::integer,
          null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
        return;
      end if;
      select issuance.* into v_parent
      from public.quote_issuances issuance
      where issuance.id = v_cursor.parent_issuance_id
        and issuance.user_id = p_owner_user_id;
      if v_parent.id is null then
        return query select 'ERROR'::text, 'INVALID_LINEAGE'::text,
          null::uuid, null::uuid, null::uuid, null::uuid, null::integer,
          null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
        return;
      end if;
      v_cursor := v_parent;
    end if;
  end loop;

  -- A historical issuance cannot create or reopen a Job directly.
  if exists (
    select 1 from public.quote_issuances successor
    where successor.user_id = p_owner_user_id
      and successor.parent_issuance_id = v_source.id
  ) then
    return query select 'NONE'::text, 'HISTORICAL'::text,
      null::uuid, null::uuid, v_root.id, v_source.id, v_source.revision_number,
      null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
    return;
  end if;

  if not exists (
    select 1 from public.quote_commercial_outcomes outcome
    where outcome.quote_issuance_id = v_source.id
      and outcome.outcome = 'ACCEPTED'
  ) then
    return query select 'NONE'::text, 'NOT_ACCEPTED'::text,
      null::uuid, null::uuid, v_root.id, v_source.id, v_source.revision_number,
      null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
    return;
  end if;

  select job.* into v_job
  from public.jobs job
  where job.owner_user_id = p_owner_user_id
    and job.source_root_issuance_id = v_root.id;
  if v_job.id is not null then
    return query select 'OPEN'::text, null::text,
      v_job.id, v_job.owner_user_id, v_job.source_root_issuance_id,
      v_job.source_issuance_id, v_job.source_revision_number, v_job.client_name,
      v_job.title, v_job.quoted_amount_cents, v_job.currency, v_job.status, v_job.created_at;
    return;
  end if;

  if not exists (
    select 1 from public.quote_issuance_snapshots snapshot
    where snapshot.quote_issuance_id = v_source.id
      and snapshot.owner_user_id = p_owner_user_id
  ) then
    return query select 'ERROR'::text, 'SNAPSHOT_MISSING'::text,
      null::uuid, null::uuid, v_root.id, v_source.id, v_source.revision_number,
      null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
    return;
  end if;

  return query select 'START'::text, null::text,
    null::uuid, null::uuid, v_root.id, v_source.id, v_source.revision_number,
    null::text, null::text, null::bigint, null::text, null::text, null::timestamptz;
end;
$$;

revoke all on function public.resolve_job_capability_internal(uuid, uuid) from public, anon, authenticated;
