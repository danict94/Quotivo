-- QF-042D correction: a business logo is replaceable; issued documents remain immutable.
alter table public.owner_file_assets drop constraint if exists owner_file_assets_version_check;
alter table public.owner_file_assets add constraint owner_file_assets_version_check check (version > 0);

create or replace function public.register_owner_file_asset(
  p_kind text, p_asset_key text, p_issuance_id uuid, p_storage_path text,
  p_mime_type text, p_size_bytes bigint, p_sha256 text
)
returns table(id uuid, owner_user_id uuid, kind text, asset_key text, issuance_id uuid, storage_path text, mime_type text, size_bytes bigint, sha256 text, version integer, status text, created_at timestamptz, deleted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_owner uuid := auth.uid(); v_asset public.owner_file_assets%rowtype; v_expected_path text;
begin
  perform public.assert_account_active();
  if p_kind not in ('LOGO','PDF','DOCX') or p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 20971520 or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'OWNER_FILE_ASSET_INVALID' using errcode = 'P0001';
  end if;
  if p_kind = 'LOGO' then
    if p_asset_key <> 'business-logo' or p_issuance_id is not null or p_mime_type not in ('image/png','image/jpeg','image/webp','image/svg+xml') then raise exception 'OWNER_FILE_ASSET_INVALID' using errcode = 'P0001'; end if;
    v_expected_path := v_owner::text || '/logo/business-logo';
  else
    if p_issuance_id is null or p_asset_key <> ('issuance:' || p_issuance_id::text || ':' || lower(p_kind)) or (p_kind = 'PDF' and p_mime_type <> 'application/pdf') or (p_kind = 'DOCX' and p_mime_type <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'OWNER_FILE_ASSET_INVALID' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.quote_issuances issuance where issuance.id = p_issuance_id and issuance.user_id = v_owner) then raise exception 'OWNER_FILE_ASSET_NOT_FOUND' using errcode = 'P0001'; end if;
    v_expected_path := v_owner::text || '/issuances/' || p_issuance_id::text || '/' || lower(p_kind);
  end if;
  if p_storage_path <> v_expected_path then raise exception 'OWNER_FILE_ASSET_INVALID' using errcode = 'P0001'; end if;
  select * into v_asset from public.owner_file_assets asset where asset.owner_user_id = v_owner and asset.asset_key = p_asset_key for update;
  if v_asset.id is not null then
    if v_asset.sha256 <> p_sha256 or v_asset.size_bytes <> p_size_bytes or v_asset.mime_type <> p_mime_type or v_asset.storage_path <> p_storage_path then
      if p_kind <> 'LOGO' then raise exception 'OWNER_FILE_ASSET_CONFLICT' using errcode = 'P0001'; end if;
      update public.owner_file_assets asset set mime_type=p_mime_type,size_bytes=p_size_bytes,sha256=p_sha256,version=asset.version+1 where asset.id=v_asset.id returning * into v_asset;
    end if;
    return query select * from public.owner_file_asset_row(v_asset); return;
  end if;
  insert into public.owner_file_assets(owner_user_id,kind,asset_key,issuance_id,storage_path,mime_type,size_bytes,sha256)
  values(v_owner,p_kind,p_asset_key,p_issuance_id,p_storage_path,p_mime_type,p_size_bytes,p_sha256) returning * into v_asset;
  return query select * from public.owner_file_asset_row(v_asset);
end;
$$;

revoke all on function public.register_owner_file_asset(text,text,uuid,text,text,bigint,text) from public, anon;
grant execute on function public.register_owner_file_asset(text,text,uuid,text,text,bigint,text) to authenticated;
