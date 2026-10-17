-- The commercial decision belongs to an issuance, not to an individual link.
-- During this transition quote_shares.commercial_outcome is a legacy projection
-- only; all new reads and decisions use quote_commercial_outcomes.
create table public.quote_commercial_outcomes (
  quote_issuance_id uuid primary key references public.quote_issuances(id) on delete cascade,
  outcome text not null check (outcome in ('ACCEPTED', 'REJECTED')),
  source text not null check (source in ('MANUAL', 'PUBLIC_LINK')),
  decided_at timestamptz not null default now(),
  source_share_id uuid references public.quote_shares(id),
  created_at timestamptz not null default now(),
  check (
    (source = 'MANUAL' and source_share_id is null)
    or (source = 'PUBLIC_LINK' and source_share_id is not null)
  )
);

alter table public.quote_commercial_outcomes enable row level security;
revoke all on public.quote_commercial_outcomes from anon, authenticated;

-- Preserve historical public-link decisions deterministically.  A malformed
-- legacy history with more than one final decision resolves to the earliest
-- recorded decision; no legacy decision is used as runtime authority afterward.
with ranked_legacy_outcomes as (
  select
    share.quote_issuance_id,
    share.commercial_outcome as outcome,
    'PUBLIC_LINK'::text as source,
    coalesce(share.accepted_at, share.rejected_at, share.responded_at, share.created_at) as decided_at,
    share.id as source_share_id,
    row_number() over (
      partition by share.quote_issuance_id
      order by coalesce(share.accepted_at, share.rejected_at, share.responded_at, share.created_at), share.id
    ) as decision_rank
  from public.quote_shares share
  where share.commercial_outcome in ('ACCEPTED', 'REJECTED')
)
insert into public.quote_commercial_outcomes (
  quote_issuance_id, outcome, source, decided_at, source_share_id
)
select quote_issuance_id, outcome, source, decided_at, source_share_id
from ranked_legacy_outcomes
where decision_rank = 1
on conflict (quote_issuance_id) do nothing;

create or replace function public.prevent_quote_commercial_outcome_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'COMMERCIAL_OUTCOME_FINAL' using errcode = 'P0001';
end;
$$;

create trigger quote_commercial_outcomes_immutable
before update on public.quote_commercial_outcomes
for each row execute function public.prevent_quote_commercial_outcome_update();

create function public.record_quote_commercial_outcome(
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
    select 1
    from public.quote_shares share
    where share.id = p_source_share_id
      and share.quote_issuance_id = p_issuance_id
      and share.lifecycle = 'ACTIVE'
  ) then
    raise exception 'INVALID_PUBLIC_LINK' using errcode = '23514';
  end if;

  insert into public.quote_commercial_outcomes (
    quote_issuance_id, outcome, source, source_share_id
  ) values (
    p_issuance_id, p_outcome, p_source, p_source_share_id
  )
  on conflict (quote_issuance_id) do nothing
  returning * into inserted;

  if inserted.quote_issuance_id is null then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001';
  end if;

  return query select
    inserted.quote_issuance_id,
    inserted.outcome,
    inserted.source,
    inserted.decided_at,
    inserted.source_share_id;
end;
$$;

revoke all on function public.record_quote_commercial_outcome(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_quote_commercial_outcome(uuid, text, text, uuid) to service_role;
