-- A revision replaces link availability of its immediate predecessor only.
-- Commercial outcomes and immutable snapshots/documents remain untouched.
create or replace function public.supersede_parent_revision_shares(
  p_parent_issuance_id uuid,
  p_revision_issuance_id uuid
)
returns integer
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_parent_issuance_id is null or p_revision_issuance_id is null then raise exception 'INVALID_REVISION_CONTEXT' using errcode = '22023'; end if;

  if not exists (
    select 1 from public.quote_issuances revision_issuance
    join public.quote_issuances parent_issuance on parent_issuance.id = revision_issuance.parent_issuance_id
    where revision_issuance.id = p_revision_issuance_id
      and revision_issuance.user_id = v_user_id
      and revision_issuance.revision_number > 0
      and parent_issuance.id = p_parent_issuance_id
      and parent_issuance.user_id = v_user_id
  ) then raise exception 'INVALID_REVISION_CONTEXT' using errcode = '23514'; end if;

  update public.quote_shares share_row
  set lifecycle = 'SUPERSEDED', superseded_at = coalesce(share_row.superseded_at, now())
  where share_row.quote_issuance_id = p_parent_issuance_id
    and share_row.owner_user_id = v_user_id
    and share_row.lifecycle = 'ACTIVE';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.supersede_parent_revision_shares(uuid, uuid) from public;
grant execute on function public.supersede_parent_revision_shares(uuid, uuid) to authenticated;
