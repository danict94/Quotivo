-- QF-042D: metadata is authoritative in Postgres; bytes live only in the
-- private owner bucket. Public quote-sharing documents remain separate.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quotivo-owner-assets', 'quotivo-owner-assets', false, 20971520,
  array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
) on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.owner_file_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('LOGO','PDF','DOCX')),
  asset_key text not null,
  issuance_id uuid references public.quote_issuances(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 check (version = 1),
  status text not null default 'ACTIVE' check (status = 'ACTIVE'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_user_id, asset_key),
  check (
    (kind = 'LOGO' and asset_key = 'business-logo' and issuance_id is null and mime_type in ('image/png','image/jpeg','image/webp','image/svg+xml')) or
    (kind = 'PDF' and issuance_id is not null and asset_key = 'issuance:' || issuance_id::text || ':pdf' and mime_type = 'application/pdf') or
    (kind = 'DOCX' and issuance_id is not null and asset_key = 'issuance:' || issuance_id::text || ':docx' and mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  )
);
create index owner_file_assets_owner_issuance_idx on public.owner_file_assets(owner_user_id, issuance_id);
alter table public.owner_file_assets enable row level security;
revoke all on public.owner_file_assets from public, anon, authenticated;
grant select on public.owner_file_assets to authenticated;
create policy "owner file assets owner read" on public.owner_file_assets for select to authenticated using (owner_user_id = auth.uid());

create function public.owner_file_asset_row(p_asset public.owner_file_assets)
returns table(id uuid, owner_user_id uuid, kind text, asset_key text, issuance_id uuid, storage_path text, mime_type text, size_bytes bigint, sha256 text, version integer, status text, created_at timestamptz, deleted_at timestamptz)
language sql security definer set search_path = '' as $$
  select p_asset.id, p_asset.owner_user_id, p_asset.kind, p_asset.asset_key, p_asset.issuance_id, p_asset.storage_path, p_asset.mime_type, p_asset.size_bytes, p_asset.sha256, p_asset.version, p_asset.status, p_asset.created_at, p_asset.deleted_at;
$$;

create function public.get_owner_file_manifest()
returns table(id uuid, owner_user_id uuid, kind text, asset_key text, issuance_id uuid, storage_path text, mime_type text, size_bytes bigint, sha256 text, version integer, status text, created_at timestamptz, deleted_at timestamptz)
language sql security definer set search_path = '' as $$
  select asset_row.*
  from public.owner_file_assets asset
  cross join lateral public.owner_file_asset_row(asset) asset_row
  where asset.owner_user_id = auth.uid() and asset.deleted_at is null
  order by asset.created_at;
$$;

create function public.register_owner_file_asset(
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
    if v_asset.sha256 <> p_sha256 or v_asset.size_bytes <> p_size_bytes or v_asset.mime_type <> p_mime_type or v_asset.storage_path <> p_storage_path then raise exception 'OWNER_FILE_ASSET_CONFLICT' using errcode = 'P0001'; end if;
    return query select * from public.owner_file_asset_row(v_asset); return;
  end if;
  insert into public.owner_file_assets(owner_user_id,kind,asset_key,issuance_id,storage_path,mime_type,size_bytes,sha256)
  values(v_owner,p_kind,p_asset_key,p_issuance_id,p_storage_path,p_mime_type,p_size_bytes,p_sha256) returning * into v_asset;
  return query select * from public.owner_file_asset_row(v_asset);
end;
$$;

revoke all on function public.owner_file_asset_row(public.owner_file_assets) from public, anon, authenticated;
revoke all on function public.get_owner_file_manifest() from public, anon;
revoke all on function public.register_owner_file_asset(text,text,uuid,text,text,bigint,text) from public, anon;
grant execute on function public.get_owner_file_manifest(), public.register_owner_file_asset(text,text,uuid,text,text,bigint,text) to authenticated;
