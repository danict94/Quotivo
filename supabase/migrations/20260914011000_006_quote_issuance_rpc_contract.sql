create or replace function public.authorize_quote_issue(stable_quote_id text)
returns table (authorized boolean, reason text, issuance_id uuid, used_this_month integer, monthly_limit integer)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); existing public.quote_issuances%rowtype; is_pro boolean; usage_count integer; month_start timestamptz := date_trunc('month', now());
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if stable_quote_id is null or length(trim(stable_quote_id)) not between 1 and 200 then raise exception 'INVALID_QUOTE_ID' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(current_user_id::text));
  select exists(select 1 from public.entitlement_grants g where g.user_id=current_user_id and g.access_level='PRO' and g.starts_at<=now() and (g.ends_at is null or g.ends_at>=now()) and g.revoked_at is null) into is_pro;
  select count(*)::integer into usage_count from public.quote_issuances q where q.user_id=current_user_id and q.issued_at>=month_start;
  select * into existing from public.quote_issuances q where q.user_id=current_user_id and q.client_quote_id=trim(stable_quote_id);
  if found then return query select true, 'AUTHORIZED', existing.id, usage_count, case when is_pro then null else 3 end; return; end if;
  if not is_pro and usage_count>=3 then return query select false, 'QUOTA_EXCEEDED', null::uuid, usage_count, 3; return; end if;
  insert into public.quote_issuances(user_id,client_quote_id) values(current_user_id,trim(stable_quote_id)) returning * into existing;
  return query select true, 'AUTHORIZED', existing.id, usage_count+1, case when is_pro then null else 3 end;
end;
$$;
