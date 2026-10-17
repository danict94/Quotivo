-- QF-010A corrective migration: the return-table output parameter
-- quote_issuance_id must not be resolved as the ON CONFLICT target.
create or replace function public.record_quote_commercial_outcome(
  p_issuance_id uuid,
  p_outcome text,
  p_source text,
  p_source_share_id uuid default null
)
returns table(
  quote_issuance_id uuid,
  outcome text,
  source text,
  decided_at timestamptz,
  source_share_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare inserted public.quote_commercial_outcomes%rowtype;
begin
  if p_issuance_id is null then
    raise exception 'INVALID_ISSUANCE' using errcode = '22023';
  end if;
  if p_outcome not in ('ACCEPTED', 'REJECTED') then
    raise exception 'INVALID_COMMERCIAL_OUTCOME' using errcode = '22023';
  end if;
  if p_source not in ('MANUAL', 'PUBLIC_LINK') then
    raise exception 'INVALID_COMMERCIAL_OUTCOME_SOURCE' using errcode = '22023';
  end if;
  if p_source = 'MANUAL' and p_source_share_id is not null then
    raise exception 'INVALID_COMMERCIAL_OUTCOME_SOURCE' using errcode = '22023';
  end if;
  if p_source = 'PUBLIC_LINK' and not exists (
    select 1 from public.quote_shares share
    where share.id = p_source_share_id and share.quote_issuance_id = p_issuance_id and share.lifecycle = 'ACTIVE'
  ) then
    raise exception 'INVALID_PUBLIC_LINK' using errcode = '23514';
  end if;

  insert into public.quote_commercial_outcomes as canonical (
    quote_issuance_id, outcome, source, source_share_id
  ) values (
    p_issuance_id, p_outcome, p_source, p_source_share_id
  )
  on conflict on constraint quote_commercial_outcomes_pkey do nothing
  returning canonical.* into inserted;

  if inserted.quote_issuance_id is null then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001';
  end if;

  return query select inserted.quote_issuance_id, inserted.outcome, inserted.source, inserted.decided_at, inserted.source_share_id;
end;
$$;

revoke all on function public.record_quote_commercial_outcome(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_quote_commercial_outcome(uuid, text, text, uuid) to service_role;
