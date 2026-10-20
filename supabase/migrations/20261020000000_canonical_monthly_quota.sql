-- The quota boundary, plan lookup and count live only on the server.
create or replace function public.quote_monthly_quota()
returns table(used_this_month integer, monthly_limit integer, remaining integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_used integer := 0;
  v_is_pro boolean := false;
begin
  perform public.assert_account_active();

  select count(*)::integer into v_used
  from public.quote_issuances issuance
  where issuance.user_id = v_user_id
    and issuance.issued_at >= date_trunc('month', now())
    and issuance.revision_number = 0;

  select exists(
    select 1
    from public.entitlement_grants grant_row
    where grant_row.user_id = v_user_id
      and grant_row.access_level = 'PRO'
      and grant_row.starts_at <= now()
      and (grant_row.ends_at is null or grant_row.ends_at >= now())
      and grant_row.revoked_at is null
  ) into v_is_pro;

  return query select
    v_used,
    case when v_is_pro then null::integer else 3 end,
    case when v_is_pro then null::integer else greatest(0, 3 - v_used) end;
end;
$$;

create or replace function public.get_quote_monthly_quota()
returns table(used_this_month integer, monthly_limit integer, remaining integer)
language sql security definer set search_path = '' as $$
  select quota.used_this_month, quota.monthly_limit, quota.remaining
  from public.quote_monthly_quota() quota;
$$;

create or replace function public.authorize_quote_issue(stable_quote_id text)
returns table(authorized boolean, reason text, issuance_id uuid, used_this_month integer, monthly_limit integer, sequence_number integer, year integer, display_number text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_existing public.quote_issuances%rowtype;
  v_quota record;
  v_year integer := extract(year from now())::integer;
  v_number integer;
  v_display text;
begin
  perform public.assert_account_active();
  if authorize_quote_issue.stable_quote_id is null or length(trim(authorize_quote_issue.stable_quote_id)) not between 1 and 200 then
    raise exception 'INVALID_QUOTE_ID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select * into v_quota from public.quote_monthly_quota();
  select issuance.* into v_existing
  from public.quote_issuances issuance
  where issuance.user_id = v_user_id
    and issuance.client_quote_id = trim(authorize_quote_issue.stable_quote_id)
  limit 1;

  if v_existing.id is not null then
    if v_existing.sequence_number is null or v_existing.sequence_year is null or v_existing.display_number is null then
      raise exception 'ISSUANCE_CANONICAL_NUMBER_MISSING' using errcode = '23514';
    end if;
    return query select true, 'AUTHORIZED', v_existing.id, v_quota.used_this_month, v_quota.monthly_limit, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
    return;
  end if;

  if v_quota.monthly_limit is not null and v_quota.used_this_month >= v_quota.monthly_limit then
    return query select false, 'QUOTA_EXCEEDED', null::uuid, v_quota.used_this_month, v_quota.monthly_limit, null::integer, v_year, null::text;
    return;
  end if;

  if not exists(
    select 1
    from public.quote_number_sequences sequence_row
    where sequence_row.owner_user_id = v_user_id
      and sequence_row.year = v_year
      and sequence_row.series_key = 'MAIN'
  ) then
    return query select false, 'SEQUENCE_UNINITIALIZED', null::uuid, v_quota.used_this_month, v_quota.monthly_limit, null::integer, v_year, null::text;
    return;
  end if;

  update public.quote_number_sequences sequence_row
  set last_number = sequence_row.last_number + 1, updated_at = now()
  where sequence_row.owner_user_id = v_user_id
    and sequence_row.year = v_year
    and sequence_row.series_key = 'MAIN'
  returning sequence_row.last_number into v_number;
  if v_number is null then raise exception 'SEQUENCE_ALLOCATION_FAILED' using errcode = '23514'; end if;

  v_display := v_number::text || '/' || v_year::text;
  insert into public.quote_issuances(user_id, client_quote_id, sequence_year, sequence_number, series_key, display_number)
  values(v_user_id, trim(authorize_quote_issue.stable_quote_id), v_year, v_number, 'MAIN', v_display)
  returning * into v_existing;
  return query select true, 'AUTHORIZED', v_existing.id, v_quota.used_this_month + 1, v_quota.monthly_limit, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
end;
$$;

create or replace function public.authorize_quote_revision_issue(stable_quote_id text, root_issuance_id uuid, parent_issuance_id uuid, root_client_quote_id text, parent_client_quote_id text, requested_revision_number integer)
returns table(authorized boolean, reason text, issuance_id uuid, used_this_month integer, monthly_limit integer, sequence_number integer, year integer, display_number text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_existing public.quote_issuances%rowtype;
  v_root public.quote_issuances%rowtype;
  v_parent public.quote_issuances%rowtype;
  v_quota record;
begin
  perform public.assert_account_active();
  if authorize_quote_revision_issue.stable_quote_id is null or length(trim(authorize_quote_revision_issue.stable_quote_id)) not between 1 and 200 or authorize_quote_revision_issue.root_issuance_id is null or authorize_quote_revision_issue.parent_issuance_id is null or authorize_quote_revision_issue.root_client_quote_id is null or authorize_quote_revision_issue.parent_client_quote_id is null or authorize_quote_revision_issue.requested_revision_number is null or authorize_quote_revision_issue.requested_revision_number < 1 then
    raise exception 'INVALID_REVISION_CONTEXT' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select * into v_quota from public.quote_monthly_quota();
  select issuance.* into v_existing
  from public.quote_issuances issuance
  where issuance.user_id = v_user_id
    and issuance.client_quote_id = trim(authorize_quote_revision_issue.stable_quote_id)
  limit 1;

  if v_existing.id is not null then
    if v_existing.revision_root_issuance_id <> authorize_quote_revision_issue.root_issuance_id or v_existing.parent_issuance_id <> authorize_quote_revision_issue.parent_issuance_id or v_existing.revision_number <> authorize_quote_revision_issue.requested_revision_number then
      raise exception 'ISSUANCE_CONTEXT_MISMATCH' using errcode = '23514';
    end if;
    return query select true, 'AUTHORIZED', v_existing.id, v_quota.used_this_month, v_quota.monthly_limit, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
    return;
  end if;

  select issuance.* into v_root
  from public.quote_issuances issuance
  where issuance.id = authorize_quote_revision_issue.root_issuance_id
    and issuance.user_id = v_user_id
    and issuance.client_quote_id = trim(authorize_quote_revision_issue.root_client_quote_id)
    and issuance.revision_number = 0;
  if v_root.id is null or v_root.sequence_number is null or v_root.sequence_year is null or v_root.display_number is null then
    raise exception 'INVALID_REVISION_ROOT' using errcode = '23514';
  end if;

  select issuance.* into v_parent
  from public.quote_issuances issuance
  where issuance.id = authorize_quote_revision_issue.parent_issuance_id
    and issuance.user_id = v_user_id
    and issuance.client_quote_id = trim(authorize_quote_revision_issue.parent_client_quote_id);
  if v_parent.id is null or v_parent.revision_number <> authorize_quote_revision_issue.requested_revision_number - 1 or (v_parent.id <> v_root.id and v_parent.revision_root_issuance_id <> v_root.id) then
    raise exception 'INVALID_REVISION_PARENT' using errcode = '23514';
  end if;

  if exists(select 1 from public.quote_issuances issuance where issuance.user_id = v_user_id and issuance.parent_issuance_id = v_parent.id) then
    return query select false, 'REVISION_PARENT_NOT_LATEST', null::uuid, v_quota.used_this_month, v_quota.monthly_limit, v_root.sequence_number, v_root.sequence_year, v_root.display_number;
    return;
  end if;
  if exists(select 1 from public.quote_issuances issuance where issuance.user_id = v_user_id and issuance.revision_root_issuance_id = v_root.id and issuance.revision_number = authorize_quote_revision_issue.requested_revision_number) then
    return query select false, 'REVISION_ALREADY_EXISTS', null::uuid, v_quota.used_this_month, v_quota.monthly_limit, v_root.sequence_number, v_root.sequence_year, v_root.display_number;
    return;
  end if;

  insert into public.quote_issuances(user_id, client_quote_id, sequence_year, sequence_number, series_key, display_number, revision_root_issuance_id, parent_issuance_id, revision_number)
  values(v_user_id, trim(authorize_quote_revision_issue.stable_quote_id), v_root.sequence_year, v_root.sequence_number, v_root.series_key, v_root.display_number, v_root.id, v_parent.id, authorize_quote_revision_issue.requested_revision_number)
  returning * into v_existing;
  return query select true, 'AUTHORIZED', v_existing.id, v_quota.used_this_month, v_quota.monthly_limit, v_existing.sequence_number, v_existing.sequence_year, v_existing.display_number;
end;
$$;

revoke all on function public.quote_monthly_quota() from public, anon, authenticated;
revoke all on function public.get_quote_monthly_quota() from public;
grant execute on function public.get_quote_monthly_quota() to authenticated;
