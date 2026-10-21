-- QF-030B2: Jobs are remote-authoritative and bound once to a revision chain.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_root_issuance_id uuid not null references public.quote_issuances(id) on delete restrict,
  source_issuance_id uuid not null references public.quote_issuances(id) on delete restrict,
  source_revision_number integer not null check (source_revision_number >= 0),
  client_name text not null check (length(trim(client_name)) > 0),
  title text not null check (length(trim(title)) > 0),
  quoted_amount_cents bigint not null check (quoted_amount_cents >= 0),
  currency text not null check (currency = 'EUR'),
  status text not null default 'OPEN' check (status = 'OPEN'),
  created_at timestamptz not null default now(),
  unique (owner_user_id, source_root_issuance_id)
);

create index jobs_owner_created_idx on public.jobs(owner_user_id, created_at desc);

alter table public.jobs enable row level security;
revoke all on public.jobs from public, anon, authenticated;
grant select on public.jobs to authenticated;
create policy "jobs owner read" on public.jobs for select to authenticated
  using (owner_user_id = auth.uid());

-- Private resolver. It has no client grant: the public wrapper establishes auth
-- and account state before exposing a capability.
create function public.resolve_job_capability_internal(
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
  v_expected integer;
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

create function public.resolve_job_capability(p_issuance_id uuid)
returns table(
  capability text, reason text, job_id uuid, owner_user_id uuid,
  source_root_issuance_id uuid, source_issuance_id uuid, source_revision_number integer,
  client_name text, title text, quoted_amount_cents bigint, currency text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_account_active();
  return query select * from public.resolve_job_capability_internal(p_issuance_id, auth.uid());
end;
$$;

create function public.start_job(p_issuance_id uuid)
returns table(
  job_id uuid, owner_user_id uuid, source_root_issuance_id uuid, source_issuance_id uuid,
  source_revision_number integer, client_name text, title text, quoted_amount_cents bigint,
  currency text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_cap record;
  v_job public.jobs%rowtype;
  v_snapshot public.quote_issuance_snapshots%rowtype;
begin
  perform public.assert_account_active();
  -- An issuance of the next revision must not race the currentness check.
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

  -- Serialize every start for a chain; repeat the resolver under this lock.
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
  ) on conflict (owner_user_id, source_root_issuance_id) do nothing
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

revoke all on function public.resolve_job_capability_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_job_capability(uuid) from public, anon;
revoke all on function public.start_job(uuid) from public, anon;
grant execute on function public.resolve_job_capability(uuid) to authenticated;
grant execute on function public.start_job(uuid) to authenticated;
