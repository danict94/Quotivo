-- QF-035A: remote-authoritative actual costs and human-work inputs for Jobs.
create table public.job_cost_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  request_key text not null check (length(trim(request_key)) > 0),
  category text not null check (category in ('MATERIALS','WORKER','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER')),
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents >= 0),
  occurred_at date not null,
  worker_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, request_key)
);
create table public.job_work_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  request_key text not null check (length(trim(request_key)) > 0),
  person_label text not null check (length(trim(person_label)) > 0),
  role text not null check (role in ('OWNER','WORKER','COLLABORATOR')),
  work_date date not null,
  duration_minutes integer not null check (duration_minutes > 0),
  cost_cents bigint check (cost_cents >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, request_key)
);
create index job_cost_entries_owner_job_occurred_idx on public.job_cost_entries(owner_user_id, job_id, occurred_at desc, created_at desc);
create index job_work_entries_owner_job_date_idx on public.job_work_entries(owner_user_id, job_id, work_date desc, created_at desc);
alter table public.job_cost_entries enable row level security;
alter table public.job_work_entries enable row level security;
revoke all on public.job_cost_entries from public, anon, authenticated;
revoke all on public.job_work_entries from public, anon, authenticated;
grant select on public.job_cost_entries, public.job_work_entries to authenticated;
create policy "job costs owner read" on public.job_cost_entries for select to authenticated using (owner_user_id = auth.uid());
create policy "job work owner read" on public.job_work_entries for select to authenticated using (owner_user_id = auth.uid());

create function public.job_cost_entry_row(p_entry public.job_cost_entries)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, category text, description text, amount_cents bigint, occurred_at date, worker_label text, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select p_entry.id, p_entry.owner_user_id, p_entry.job_id, p_entry.request_key, p_entry.category, p_entry.description, p_entry.amount_cents, p_entry.occurred_at, p_entry.worker_label, p_entry.created_at, p_entry.updated_at;
$$;
create function public.job_work_entry_row(p_entry public.job_work_entries)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, person_label text, role text, work_date date, duration_minutes integer, cost_cents bigint, note text, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select p_entry.id, p_entry.owner_user_id, p_entry.job_id, p_entry.request_key, p_entry.person_label, p_entry.role, p_entry.work_date, p_entry.duration_minutes, p_entry.cost_cents, p_entry.note, p_entry.created_at, p_entry.updated_at;
$$;

create function public.list_job_cost_entries(p_job_id uuid)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, category text, description text, amount_cents bigint, occurred_at date, worker_label text, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select entry.id, entry.owner_user_id, entry.job_id, entry.request_key, entry.category, entry.description, entry.amount_cents, entry.occurred_at, entry.worker_label, entry.created_at, entry.updated_at
  from public.job_cost_entries entry where entry.job_id = p_job_id and entry.owner_user_id = auth.uid() order by entry.occurred_at desc, entry.created_at desc;
$$;
create function public.list_job_work_entries(p_job_id uuid)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, person_label text, role text, work_date date, duration_minutes integer, cost_cents bigint, note text, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select entry.id, entry.owner_user_id, entry.job_id, entry.request_key, entry.person_label, entry.role, entry.work_date, entry.duration_minutes, entry.cost_cents, entry.note, entry.created_at, entry.updated_at
  from public.job_work_entries entry where entry.job_id = p_job_id and entry.owner_user_id = auth.uid() order by entry.work_date desc, entry.created_at desc;
$$;

create function public.create_job_cost_entry(p_job_id uuid, p_request_key text, p_category text, p_description text, p_amount_cents bigint, p_occurred_at date, p_worker_label text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, category text, description text, amount_cents bigint, occurred_at date, worker_label text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_cost_entries%rowtype;
begin
  perform public.assert_account_active();
  if not exists (select 1 from public.jobs job where job.id = p_job_id and job.owner_user_id = auth.uid()) then raise exception 'JOB_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_category not in ('MATERIALS','WORKER','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER') or coalesce(length(trim(p_description)), 0) = 0 or p_amount_cents is null or p_amount_cents < 0 or p_occurred_at is null then raise exception 'JOB_COST_INVALID' using errcode = 'P0001'; end if;
  insert into public.job_cost_entries(owner_user_id, job_id, request_key, category, description, amount_cents, occurred_at, worker_label)
  values (auth.uid(), p_job_id, p_request_key, p_category, trim(p_description), p_amount_cents, p_occurred_at, nullif(trim(coalesce(p_worker_label, '')), ''))
  on conflict (owner_user_id, request_key) do nothing returning * into v_entry;
  if v_entry.id is null then
    select entry.* into v_entry from public.job_cost_entries entry where entry.owner_user_id = auth.uid() and entry.request_key = p_request_key;
    if v_entry.job_id <> p_job_id or v_entry.category <> p_category or v_entry.description <> trim(p_description) or v_entry.amount_cents <> p_amount_cents or v_entry.occurred_at <> p_occurred_at or v_entry.worker_label is distinct from nullif(trim(coalesce(p_worker_label, '')), '') then raise exception 'JOB_COST_REQUEST_CONFLICT' using errcode = 'P0001'; end if;
  end if;
  return query select * from public.job_cost_entry_row(v_entry);
end; $$;

create function public.update_job_cost_entry(p_entry_id uuid, p_category text, p_description text, p_amount_cents bigint, p_occurred_at date, p_worker_label text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, category text, description text, amount_cents bigint, occurred_at date, worker_label text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_cost_entries%rowtype;
begin
  perform public.assert_account_active();
  if p_category not in ('MATERIALS','WORKER','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER') or coalesce(length(trim(p_description)), 0) = 0 or p_amount_cents is null or p_amount_cents < 0 or p_occurred_at is null then raise exception 'JOB_COST_INVALID' using errcode = 'P0001'; end if;
  update public.job_cost_entries entry set category=p_category, description=trim(p_description), amount_cents=p_amount_cents, occurred_at=p_occurred_at, worker_label=nullif(trim(coalesce(p_worker_label, '')), ''), updated_at=now() where entry.id=p_entry_id and entry.owner_user_id=auth.uid() returning * into v_entry;
  if v_entry.id is null then raise exception 'JOB_COST_NOT_FOUND' using errcode = 'P0001'; end if;
  return query select * from public.job_cost_entry_row(v_entry);
end; $$;

create function public.delete_job_cost_entry(p_entry_id uuid) returns void language plpgsql security definer set search_path = '' as $$ begin perform public.assert_account_active(); delete from public.job_cost_entries where id=p_entry_id and owner_user_id=auth.uid(); end; $$;

create function public.create_job_work_entry(p_job_id uuid, p_request_key text, p_person_label text, p_role text, p_work_date date, p_duration_minutes integer, p_cost_cents bigint default null, p_note text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, person_label text, role text, work_date date, duration_minutes integer, cost_cents bigint, note text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_work_entries%rowtype;
begin
  perform public.assert_account_active();
  if not exists (select 1 from public.jobs job where job.id=p_job_id and job.owner_user_id=auth.uid()) then raise exception 'JOB_NOT_FOUND' using errcode='P0001'; end if;
  if coalesce(length(trim(p_person_label)),0)=0 or p_role not in ('OWNER','WORKER','COLLABORATOR') or p_work_date is null or p_duration_minutes is null or p_duration_minutes <= 0 or p_cost_cents < 0 then raise exception 'JOB_WORK_INVALID' using errcode='P0001'; end if;
  insert into public.job_work_entries(owner_user_id,job_id,request_key,person_label,role,work_date,duration_minutes,cost_cents,note) values(auth.uid(),p_job_id,p_request_key,trim(p_person_label),p_role,p_work_date,p_duration_minutes,p_cost_cents,nullif(trim(coalesce(p_note,'')),'')) on conflict(owner_user_id,request_key) do nothing returning * into v_entry;
  if v_entry.id is null then select entry.* into v_entry from public.job_work_entries entry where entry.owner_user_id=auth.uid() and entry.request_key=p_request_key; if v_entry.job_id<>p_job_id or v_entry.person_label<>trim(p_person_label) or v_entry.role<>p_role or v_entry.work_date<>p_work_date or v_entry.duration_minutes<>p_duration_minutes or v_entry.cost_cents is distinct from p_cost_cents or v_entry.note is distinct from nullif(trim(coalesce(p_note,'')), '') then raise exception 'JOB_WORK_REQUEST_CONFLICT' using errcode='P0001'; end if; end if;
  return query select * from public.job_work_entry_row(v_entry);
end; $$;

create function public.update_job_work_entry(p_entry_id uuid, p_person_label text, p_role text, p_work_date date, p_duration_minutes integer, p_cost_cents bigint default null, p_note text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, person_label text, role text, work_date date, duration_minutes integer, cost_cents bigint, note text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_work_entries%rowtype;
begin
  perform public.assert_account_active();
  if coalesce(length(trim(p_person_label)),0)=0 or p_role not in ('OWNER','WORKER','COLLABORATOR') or p_work_date is null or p_duration_minutes is null or p_duration_minutes <= 0 or p_cost_cents < 0 then raise exception 'JOB_WORK_INVALID' using errcode='P0001'; end if;
  update public.job_work_entries entry set person_label=trim(p_person_label),role=p_role,work_date=p_work_date,duration_minutes=p_duration_minutes,cost_cents=p_cost_cents,note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where entry.id=p_entry_id and entry.owner_user_id=auth.uid() returning * into v_entry;
  if v_entry.id is null then raise exception 'JOB_WORK_NOT_FOUND' using errcode='P0001'; end if;
  return query select * from public.job_work_entry_row(v_entry);
end; $$;
create function public.delete_job_work_entry(p_entry_id uuid) returns void language plpgsql security definer set search_path = '' as $$ begin perform public.assert_account_active(); delete from public.job_work_entries where id=p_entry_id and owner_user_id=auth.uid(); end; $$;

revoke all on function public.job_cost_entry_row(public.job_cost_entries) from public, anon, authenticated;
revoke all on function public.job_work_entry_row(public.job_work_entries) from public, anon, authenticated;
revoke all on function public.list_job_cost_entries(uuid), public.list_job_work_entries(uuid), public.create_job_cost_entry(uuid,text,text,text,bigint,date,text), public.update_job_cost_entry(uuid,text,text,bigint,date,text), public.delete_job_cost_entry(uuid), public.create_job_work_entry(uuid,text,text,text,date,integer,bigint,text), public.update_job_work_entry(uuid,text,text,date,integer,bigint,text), public.delete_job_work_entry(uuid) from public, anon;
grant execute on function public.list_job_cost_entries(uuid), public.list_job_work_entries(uuid), public.create_job_cost_entry(uuid,text,text,text,bigint,date,text), public.update_job_cost_entry(uuid,text,text,bigint,date,text), public.delete_job_cost_entry(uuid), public.create_job_work_entry(uuid,text,text,text,date,integer,bigint,text), public.update_job_work_entry(uuid,text,text,date,integer,bigint,text), public.delete_job_work_entry(uuid) to authenticated;
