create or replace function public.authorize_quote_issue(stable_quote_id text)
returns table(
  authorized boolean,
  reason text,
  issuance_id uuid,
  used_this_month integer,
  monthly_limit integer,
  sequence_number integer,
  year integer,
  display_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_issuance public.quote_issuances%rowtype;
  v_monthly_count integer := 0;
  v_is_pro boolean := false;
  v_sequence_year integer := extract(year from now())::integer;
  v_sequence_number integer;
  v_display_number text;
  v_month_start timestamptz := date_trunc('month', now());
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if stable_quote_id is null or length(trim(stable_quote_id)) not between 1 and 200 then
    raise exception 'INVALID_QUOTE_ID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select q.*
  into v_existing_issuance
  from public.quote_issuances as q
  where q.user_id = v_user_id
    and q.client_quote_id = trim(stable_quote_id)
  limit 1;

  if v_existing_issuance.id is not null then
    if v_existing_issuance.sequence_number is null
      or v_existing_issuance.sequence_year is null
      or v_existing_issuance.display_number is null then
      raise exception 'ISSUANCE_CANONICAL_NUMBER_MISSING' using errcode = '23514';
    end if;

    select count(*)::integer
    into v_monthly_count
    from public.quote_issuances as q
    where q.user_id = v_user_id
      and q.issued_at >= v_month_start;

    select exists(
      select 1
      from public.entitlement_grants as g
      where g.user_id = v_user_id
        and g.access_level = 'PRO'
        and g.starts_at <= now()
        and (g.ends_at is null or g.ends_at >= now())
        and g.revoked_at is null
    )
    into v_is_pro;

    return query
    select
      true,
      'AUTHORIZED',
      v_existing_issuance.id,
      v_monthly_count,
      case when v_is_pro then null else 3 end,
      v_existing_issuance.sequence_number,
      v_existing_issuance.sequence_year,
      v_existing_issuance.display_number;
    return;
  end if;

  select count(*)::integer
  into v_monthly_count
  from public.quote_issuances as q
  where q.user_id = v_user_id
    and q.issued_at >= v_month_start;

  select exists(
    select 1
    from public.entitlement_grants as g
    where g.user_id = v_user_id
      and g.access_level = 'PRO'
      and g.starts_at <= now()
      and (g.ends_at is null or g.ends_at >= now())
      and g.revoked_at is null
  )
  into v_is_pro;

  if not v_is_pro and v_monthly_count >= 3 then
    return query
    select false, 'QUOTA_EXCEEDED', null::uuid, v_monthly_count, 3, null::integer, v_sequence_year, null::text;
    return;
  end if;

  if not exists(
    select 1
    from public.quote_number_sequences as s
    where s.owner_user_id = v_user_id
      and s.year = v_sequence_year
      and s.series_key = 'MAIN'
  ) then
    return query
    select false, 'SEQUENCE_UNINITIALIZED', null::uuid, v_monthly_count, case when v_is_pro then null else 3 end, null::integer, v_sequence_year, null::text;
    return;
  end if;

  update public.quote_number_sequences as s
  set last_number = s.last_number + 1,
      updated_at = now()
  where s.owner_user_id = v_user_id
    and s.year = v_sequence_year
    and s.series_key = 'MAIN'
  returning s.last_number into v_sequence_number;

  if v_sequence_number is null then
    raise exception 'SEQUENCE_ALLOCATION_FAILED' using errcode = '23514';
  end if;

  v_display_number := v_sequence_number::text || '/' || v_sequence_year::text;

  insert into public.quote_issuances (
    user_id,
    client_quote_id,
    sequence_year,
    sequence_number,
    series_key,
    display_number
  )
  values (
    v_user_id,
    trim(stable_quote_id),
    v_sequence_year,
    v_sequence_number,
    'MAIN',
    v_display_number
  )
  returning * into v_existing_issuance;

  if v_existing_issuance.id is null
    or v_existing_issuance.sequence_number is null
    or v_existing_issuance.sequence_year is null
    or v_existing_issuance.display_number is null then
    raise exception 'ISSUANCE_CANONICAL_NUMBER_MISSING' using errcode = '23514';
  end if;

  return query
  select
    true,
    'AUTHORIZED',
    v_existing_issuance.id,
    v_monthly_count + 1,
    case when v_is_pro then null else 3 end,
    v_existing_issuance.sequence_number,
    v_existing_issuance.sequence_year,
    v_existing_issuance.display_number;
end;
$$;

revoke all on function public.authorize_quote_issue(text) from public;
grant execute on function public.authorize_quote_issue(text) to authenticated;
