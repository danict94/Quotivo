-- Correct QF-035A create contracts: qualify unique constraints under plpgsql variable_conflict=error.
create or replace function public.create_job_cost_entry(p_job_id uuid, p_request_key text, p_category text, p_description text, p_amount_cents bigint, p_occurred_at date, p_worker_label text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, category text, description text, amount_cents bigint, occurred_at date, worker_label text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_cost_entries%rowtype;
begin
  perform public.assert_account_active();
  if not exists (select 1 from public.jobs job where job.id = p_job_id and job.owner_user_id = auth.uid()) then raise exception 'JOB_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_category not in ('MATERIALS','WORKER','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER') or coalesce(length(trim(p_description)), 0) = 0 or p_amount_cents is null or p_amount_cents < 0 or p_occurred_at is null then raise exception 'JOB_COST_INVALID' using errcode = 'P0001'; end if;
  insert into public.job_cost_entries(owner_user_id, job_id, request_key, category, description, amount_cents, occurred_at, worker_label) values (auth.uid(), p_job_id, p_request_key, p_category, trim(p_description), p_amount_cents, p_occurred_at, nullif(trim(coalesce(p_worker_label, '')), '')) on conflict on constraint job_cost_entries_owner_user_id_request_key_key do nothing returning * into v_entry;
  if v_entry.id is null then select entry.* into v_entry from public.job_cost_entries entry where entry.owner_user_id = auth.uid() and entry.request_key = p_request_key; if v_entry.job_id <> p_job_id or v_entry.category <> p_category or v_entry.description <> trim(p_description) or v_entry.amount_cents <> p_amount_cents or v_entry.occurred_at <> p_occurred_at or v_entry.worker_label is distinct from nullif(trim(coalesce(p_worker_label, '')), '') then raise exception 'JOB_COST_REQUEST_CONFLICT' using errcode = 'P0001'; end if; end if;
  return query select * from public.job_cost_entry_row(v_entry);
end; $$;
create or replace function public.create_job_work_entry(p_job_id uuid, p_request_key text, p_person_label text, p_role text, p_work_date date, p_duration_minutes integer, p_cost_cents bigint default null, p_note text default null)
returns table(id uuid, owner_user_id uuid, job_id uuid, request_key text, person_label text, role text, work_date date, duration_minutes integer, cost_cents bigint, note text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_entry public.job_work_entries%rowtype;
begin
  perform public.assert_account_active();
  if not exists (select 1 from public.jobs job where job.id=p_job_id and job.owner_user_id=auth.uid()) then raise exception 'JOB_NOT_FOUND' using errcode='P0001'; end if;
  if coalesce(length(trim(p_person_label)),0)=0 or p_role not in ('OWNER','WORKER','COLLABORATOR') or p_work_date is null or p_duration_minutes is null or p_duration_minutes <= 0 or p_cost_cents < 0 then raise exception 'JOB_WORK_INVALID' using errcode='P0001'; end if;
  insert into public.job_work_entries(owner_user_id,job_id,request_key,person_label,role,work_date,duration_minutes,cost_cents,note) values(auth.uid(),p_job_id,p_request_key,trim(p_person_label),p_role,p_work_date,p_duration_minutes,p_cost_cents,nullif(trim(coalesce(p_note,'')),'')) on conflict on constraint job_work_entries_owner_user_id_request_key_key do nothing returning * into v_entry;
  if v_entry.id is null then select entry.* into v_entry from public.job_work_entries entry where entry.owner_user_id=auth.uid() and entry.request_key=p_request_key; if v_entry.job_id<>p_job_id or v_entry.person_label<>trim(p_person_label) or v_entry.role<>p_role or v_entry.work_date<>p_work_date or v_entry.duration_minutes<>p_duration_minutes or v_entry.cost_cents is distinct from p_cost_cents or v_entry.note is distinct from nullif(trim(coalesce(p_note,'')), '') then raise exception 'JOB_WORK_REQUEST_CONFLICT' using errcode='P0001'; end if; end if;
  return query select * from public.job_work_entry_row(v_entry);
end; $$;
