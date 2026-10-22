-- QF-035B: personal labour cost is canonical only in job_work_entries.cost_cents.
-- Historic WORKER rows remain readable; this guard applies only to future writes.
create function public.prevent_generic_job_worker_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category = 'WORKER' then
    raise exception 'JOB_LABOR_COST_MUST_USE_WORK_ENTRY' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger job_cost_entries_prevent_generic_worker_cost
before insert or update of category on public.job_cost_entries
for each row execute function public.prevent_generic_job_worker_cost();

create or replace function public.create_job_cost_entry(p_job_id uuid, p_request_key text, p_category text, p_description text, p_amount_cents bigint, p_occurred_at date, p_worker_label text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, category text, description text, amount_cents bigint, occurred_at date, worker_label text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_cost_entries%rowtype;
begin
  perform public.assert_account_active();
  if not exists (select 1 from public.jobs job where job.id = p_job_id and job.owner_user_id = auth.uid()) then raise exception 'JOB_NOT_FOUND' using errcode = 'P0001'; end if;

  -- Preserve idempotent recovery of an existing historic record without permitting a new one.
  if p_category = 'WORKER' then
    select entry.* into v_entry from public.job_cost_entries entry where entry.owner_user_id = auth.uid() and entry.request_key = p_request_key;
    if v_entry.id is not null and v_entry.job_id = p_job_id and v_entry.category = p_category and v_entry.description = trim(p_description) and v_entry.amount_cents = p_amount_cents and v_entry.occurred_at = p_occurred_at and v_entry.worker_label is not distinct from nullif(trim(coalesce(p_worker_label, '')), '') then
      return query select * from public.job_cost_entry_row(v_entry);
    end if;
    raise exception 'JOB_LABOR_COST_MUST_USE_WORK_ENTRY' using errcode = 'P0001';
  end if;

  if p_category not in ('MATERIALS','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER') or coalesce(length(trim(p_description)), 0) = 0 or p_amount_cents is null or p_amount_cents < 0 or p_occurred_at is null then raise exception 'JOB_COST_INVALID' using errcode = 'P0001'; end if;
  insert into public.job_cost_entries(owner_user_id, job_id, request_key, category, description, amount_cents, occurred_at, worker_label)
  values (auth.uid(), p_job_id, p_request_key, p_category, trim(p_description), p_amount_cents, p_occurred_at, nullif(trim(coalesce(p_worker_label, '')), ''))
  on conflict on constraint job_cost_entries_owner_user_id_request_key_key do nothing returning * into v_entry;
  if v_entry.id is null then
    select entry.* into v_entry from public.job_cost_entries entry where entry.owner_user_id = auth.uid() and entry.request_key = p_request_key;
    if v_entry.job_id <> p_job_id or v_entry.category <> p_category or v_entry.description <> trim(p_description) or v_entry.amount_cents <> p_amount_cents or v_entry.occurred_at <> p_occurred_at or v_entry.worker_label is distinct from nullif(trim(coalesce(p_worker_label, '')), '') then raise exception 'JOB_COST_REQUEST_CONFLICT' using errcode = 'P0001'; end if;
  end if;
  return query select * from public.job_cost_entry_row(v_entry);
end;
$$;

create or replace function public.update_job_cost_entry(p_entry_id uuid, p_category text, p_description text, p_amount_cents bigint, p_occurred_at date, p_worker_label text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, category text, description text, amount_cents bigint, occurred_at date, worker_label text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_cost_entries%rowtype;
begin
  perform public.assert_account_active();
  if p_category = 'WORKER' then raise exception 'JOB_LABOR_COST_MUST_USE_WORK_ENTRY' using errcode = 'P0001'; end if;
  if p_category not in ('MATERIALS','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER') or coalesce(length(trim(p_description)), 0) = 0 or p_amount_cents is null or p_amount_cents < 0 or p_occurred_at is null then raise exception 'JOB_COST_INVALID' using errcode = 'P0001'; end if;
  update public.job_cost_entries entry set category=p_category, description=trim(p_description), amount_cents=p_amount_cents, occurred_at=p_occurred_at, worker_label=nullif(trim(coalesce(p_worker_label, '')), ''), updated_at=now() where entry.id=p_entry_id and entry.owner_user_id=auth.uid() returning * into v_entry;
  if v_entry.id is null then raise exception 'JOB_COST_NOT_FOUND' using errcode = 'P0001'; end if;
  return query select * from public.job_cost_entry_row(v_entry);
end;
$$;

revoke all on function public.prevent_generic_job_worker_cost() from public, anon, authenticated;
revoke all on function public.create_job_cost_entry(uuid,text,text,text,bigint,date,text), public.update_job_cost_entry(uuid,text,text,bigint,date,text) from public, anon;
grant execute on function public.create_job_cost_entry(uuid,text,text,text,bigint,date,text), public.update_job_cost_entry(uuid,text,text,bigint,date,text) to authenticated;
