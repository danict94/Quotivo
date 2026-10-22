-- QF-042A: remote authority for business profile, clients and catalog configuration.
-- SQLite remains a projection; all client mutations pass through the durable RPC.

create table public.business_profiles (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default '', tax_id text not null default '', vat_number text not null default '',
  address text not null default '', postal_code text not null default '', city text not null default '', province text not null default '',
  email text not null default '', phone text not null default '', website text not null default '',
  default_conditions text not null default '', default_validity_days integer not null default 30 check (default_validity_days between 1 and 3650),
  default_payment_terms text not null default '',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.durability_clients (
  id text not null, owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, contact_name text not null default '', phone text not null default '', email text not null default '',
  address text not null default '', tax_id text not null default '', vat_number text not null default '',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (owner_user_id, id)
);

create table public.durability_catalog_items (
  id text not null, owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, price_mode text not null check (price_mode in ('measured', 'body')),
  unit_code text, unit_label text not null default '', price_cents bigint not null check (price_cents >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (owner_user_id, id),
  check ((price_mode = 'body' and unit_code is null and unit_label = '') or (price_mode = 'measured' and unit_code is not null and length(trim(unit_label)) > 0))
);

create table public.durability_measurement_units (
  code text not null, owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null, is_custom boolean not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (owner_user_id, code)
);

create table public.durability_vat_rates (
  code text not null, owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null, rate_basis_points integer not null check (rate_basis_points between 0 and 100000), is_custom boolean not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (owner_user_id, code)
);

-- Server-side request ledger makes retries safe even when a device dies after a successful RPC.
create table public.durability_sync_operations (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('BUSINESS_PROFILE', 'CLIENT', 'CATALOG_ITEM', 'MEASUREMENT_UNIT', 'VAT_RATE')),
  entity_id text not null, operation_id text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, entity_type, entity_id, operation_id)
);

create index durability_clients_owner_updated_idx on public.durability_clients(owner_user_id, updated_at);
create index durability_catalog_items_owner_updated_idx on public.durability_catalog_items(owner_user_id, updated_at);
create index durability_units_owner_updated_idx on public.durability_measurement_units(owner_user_id, updated_at);
create index durability_vat_owner_updated_idx on public.durability_vat_rates(owner_user_id, updated_at);

alter table public.business_profiles enable row level security;
alter table public.durability_clients enable row level security;
alter table public.durability_catalog_items enable row level security;
alter table public.durability_measurement_units enable row level security;
alter table public.durability_vat_rates enable row level security;
alter table public.durability_sync_operations enable row level security;

revoke all on public.business_profiles, public.durability_clients, public.durability_catalog_items, public.durability_measurement_units, public.durability_vat_rates, public.durability_sync_operations from public, anon, authenticated;
grant select on public.business_profiles, public.durability_clients, public.durability_catalog_items, public.durability_measurement_units, public.durability_vat_rates to authenticated;

create policy "business profiles owner read" on public.business_profiles for select to authenticated using (owner_user_id = auth.uid());
create policy "durability clients owner read" on public.durability_clients for select to authenticated using (owner_user_id = auth.uid());
create policy "durability catalog owner read" on public.durability_catalog_items for select to authenticated using (owner_user_id = auth.uid());
create policy "durability units owner read" on public.durability_measurement_units for select to authenticated using (owner_user_id = auth.uid());
create policy "durability vat owner read" on public.durability_vat_rates for select to authenticated using (owner_user_id = auth.uid());

create function public.durability_record(p_entity_type text, p_entity_id text, p_owner_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row record;
begin
  if p_entity_type = 'BUSINESS_PROFILE' then
    select * into v_row from public.business_profiles where owner_user_id = p_owner_user_id;
    if v_row.owner_user_id is null then return null; end if;
    return jsonb_build_object('entity_type', p_entity_type, 'entity_id', 'profile', 'version', v_row.version, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'deleted_at', v_row.deleted_at, 'payload', jsonb_build_object('businessName', v_row.business_name, 'taxId', v_row.tax_id, 'vatNumber', v_row.vat_number, 'address', v_row.address, 'postalCode', v_row.postal_code, 'city', v_row.city, 'province', v_row.province, 'email', v_row.email, 'phone', v_row.phone, 'website', v_row.website, 'defaultConditions', v_row.default_conditions, 'defaultValidityDays', v_row.default_validity_days, 'defaultPaymentTerms', v_row.default_payment_terms));
  elsif p_entity_type = 'CLIENT' then
    select * into v_row from public.durability_clients where owner_user_id = p_owner_user_id and id = p_entity_id;
    if v_row.id is null then return null; end if;
    return jsonb_build_object('entity_type', p_entity_type, 'entity_id', v_row.id, 'version', v_row.version, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'deleted_at', v_row.deleted_at, 'payload', jsonb_build_object('name', v_row.name, 'contactName', v_row.contact_name, 'phone', v_row.phone, 'email', v_row.email, 'address', v_row.address, 'taxId', v_row.tax_id, 'vatNumber', v_row.vat_number));
  elsif p_entity_type = 'CATALOG_ITEM' then
    select * into v_row from public.durability_catalog_items where owner_user_id = p_owner_user_id and id = p_entity_id;
    if v_row.id is null then return null; end if;
    return jsonb_build_object('entity_type', p_entity_type, 'entity_id', v_row.id, 'version', v_row.version, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'deleted_at', v_row.deleted_at, 'payload', jsonb_build_object('title', v_row.title, 'priceMode', v_row.price_mode, 'unitCode', v_row.unit_code, 'unitLabel', v_row.unit_label, 'priceCents', v_row.price_cents));
  elsif p_entity_type = 'MEASUREMENT_UNIT' then
    select * into v_row from public.durability_measurement_units where owner_user_id = p_owner_user_id and code = p_entity_id;
    if v_row.code is null then return null; end if;
    return jsonb_build_object('entity_type', p_entity_type, 'entity_id', v_row.code, 'version', v_row.version, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'deleted_at', v_row.deleted_at, 'payload', jsonb_build_object('label', v_row.label, 'isCustom', v_row.is_custom));
  elsif p_entity_type = 'VAT_RATE' then
    select * into v_row from public.durability_vat_rates where owner_user_id = p_owner_user_id and code = p_entity_id;
    if v_row.code is null then return null; end if;
    return jsonb_build_object('entity_type', p_entity_type, 'entity_id', v_row.code, 'version', v_row.version, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'deleted_at', v_row.deleted_at, 'payload', jsonb_build_object('label', v_row.label, 'rateBasisPoints', v_row.rate_basis_points, 'isCustom', v_row.is_custom));
  end if;
  raise exception 'DURABILITY_ENTITY_INVALID' using errcode = 'P0001';
end;
$$;

create function public.get_durability_snapshot()
returns table(entity_type text, entity_id text, version bigint, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz, payload jsonb)
language sql security definer set search_path = '' as $$
  select 'BUSINESS_PROFILE', 'profile', p.version, p.created_at, p.updated_at, p.deleted_at, jsonb_build_object('businessName',p.business_name,'taxId',p.tax_id,'vatNumber',p.vat_number,'address',p.address,'postalCode',p.postal_code,'city',p.city,'province',p.province,'email',p.email,'phone',p.phone,'website',p.website,'defaultConditions',p.default_conditions,'defaultValidityDays',p.default_validity_days,'defaultPaymentTerms',p.default_payment_terms) from public.business_profiles p where p.owner_user_id=auth.uid()
  union all select 'CLIENT',c.id,c.version,c.created_at,c.updated_at,c.deleted_at,jsonb_build_object('name',c.name,'contactName',c.contact_name,'phone',c.phone,'email',c.email,'address',c.address,'taxId',c.tax_id,'vatNumber',c.vat_number) from public.durability_clients c where c.owner_user_id=auth.uid()
  union all select 'CATALOG_ITEM',i.id,i.version,i.created_at,i.updated_at,i.deleted_at,jsonb_build_object('title',i.title,'priceMode',i.price_mode,'unitCode',i.unit_code,'unitLabel',i.unit_label,'priceCents',i.price_cents) from public.durability_catalog_items i where i.owner_user_id=auth.uid()
  union all select 'MEASUREMENT_UNIT',u.code,u.version,u.created_at,u.updated_at,u.deleted_at,jsonb_build_object('label',u.label,'isCustom',u.is_custom) from public.durability_measurement_units u where u.owner_user_id=auth.uid()
  union all select 'VAT_RATE',v.code,v.version,v.created_at,v.updated_at,v.deleted_at,jsonb_build_object('label',v.label,'rateBasisPoints',v.rate_basis_points,'isCustom',v.is_custom) from public.durability_vat_rates v where v.owner_user_id=auth.uid();
$$;

create function public.sync_durability_entity(p_entity_type text, p_entity_id text, p_operation_id text, p_expected_version bigint, p_payload jsonb)
returns table(outcome text, record jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict error
declare v_owner uuid := auth.uid(); v_existing jsonb; v_result jsonb; v_deleted boolean; v_valid jsonb;
begin
  perform public.assert_account_active();
  if p_entity_type not in ('BUSINESS_PROFILE','CLIENT','CATALOG_ITEM','MEASUREMENT_UNIT','VAT_RATE') or coalesce(length(trim(p_entity_id)),0)=0 or coalesce(length(trim(p_operation_id)),0)=0 or jsonb_typeof(p_payload) <> 'object' then raise exception 'DURABILITY_ENTITY_INVALID' using errcode='P0001'; end if;
  if p_entity_type='BUSINESS_PROFILE' and p_entity_id <> 'profile' then raise exception 'DURABILITY_ENTITY_INVALID' using errcode='P0001'; end if;
  select operation.result into v_result from public.durability_sync_operations operation where operation.owner_user_id=v_owner and operation.entity_type=p_entity_type and operation.entity_id=p_entity_id and operation.operation_id=p_operation_id;
  if v_result is not null then
    select operation.payload into v_valid from public.durability_sync_operations operation where operation.owner_user_id=v_owner and operation.entity_type=p_entity_type and operation.entity_id=p_entity_id and operation.operation_id=p_operation_id;
    if v_valid <> p_payload then raise exception 'DURABILITY_OPERATION_CONFLICT' using errcode='P0001'; end if;
    return query select v_result->>'outcome', v_result->'record'; return;
  end if;
  v_existing := public.durability_record(p_entity_type, p_entity_id, v_owner);
  -- A legacy/new-device upload without a known version is accepted only when it
  -- is byte-for-byte equivalent to the canonical projection. Divergence is an
  -- explicit conflict, never an implicit last-write-wins overwrite.
  if v_existing is not null and p_expected_version is null
    and (v_existing->'payload' = (p_payload - 'deleted'))
    and ((v_existing->>'deleted_at') is not null) = coalesce((p_payload->>'deleted')::boolean, false) then
    v_result:=jsonb_build_object('outcome','APPLIED','record',v_existing);
    insert into public.durability_sync_operations values(v_owner,p_entity_type,p_entity_id,p_operation_id,p_payload,v_result);
    return query select 'APPLIED',v_existing; return;
  end if;
  if v_existing is not null and (p_expected_version is null or (v_existing->>'version')::bigint <> p_expected_version) then
    v_result:=jsonb_build_object('outcome','CONFLICT','record',v_existing);
    insert into public.durability_sync_operations values(v_owner,p_entity_type,p_entity_id,p_operation_id,p_payload,v_result);
    return query select 'CONFLICT',v_existing; return;
  end if;
  v_deleted := coalesce((p_payload->>'deleted')::boolean, false);
  if p_entity_type='BUSINESS_PROFILE' then
    if jsonb_typeof(p_payload->'businessName')<>'string' or jsonb_typeof(p_payload->'defaultValidityDays')<>'number' or (p_payload->>'defaultValidityDays')::integer not between 1 and 3650 then raise exception 'DURABILITY_PROFILE_INVALID' using errcode='P0001'; end if;
    insert into public.business_profiles(owner_user_id,business_name,tax_id,vat_number,address,postal_code,city,province,email,phone,website,default_conditions,default_validity_days,default_payment_terms,deleted_at) values(v_owner,coalesce(p_payload->>'businessName',''),coalesce(p_payload->>'taxId',''),coalesce(p_payload->>'vatNumber',''),coalesce(p_payload->>'address',''),coalesce(p_payload->>'postalCode',''),coalesce(p_payload->>'city',''),coalesce(p_payload->>'province',''),coalesce(p_payload->>'email',''),coalesce(p_payload->>'phone',''),coalesce(p_payload->>'website',''),coalesce(p_payload->>'defaultConditions',''),(p_payload->>'defaultValidityDays')::integer,coalesce(p_payload->>'defaultPaymentTerms',''),case when v_deleted then now() else null end)
    on conflict(owner_user_id) do update set business_name=excluded.business_name,tax_id=excluded.tax_id,vat_number=excluded.vat_number,address=excluded.address,postal_code=excluded.postal_code,city=excluded.city,province=excluded.province,email=excluded.email,phone=excluded.phone,website=excluded.website,default_conditions=excluded.default_conditions,default_validity_days=excluded.default_validity_days,default_payment_terms=excluded.default_payment_terms,deleted_at=excluded.deleted_at,version=public.business_profiles.version+1,updated_at=now();
  elsif p_entity_type='CLIENT' then
    if coalesce(length(trim(p_payload->>'name')),0)=0 then raise exception 'DURABILITY_CLIENT_INVALID' using errcode='P0001'; end if;
    insert into public.durability_clients(id,owner_user_id,name,contact_name,phone,email,address,tax_id,vat_number,deleted_at) values(p_entity_id,v_owner,trim(p_payload->>'name'),coalesce(p_payload->>'contactName',''),coalesce(p_payload->>'phone',''),coalesce(p_payload->>'email',''),coalesce(p_payload->>'address',''),coalesce(p_payload->>'taxId',''),coalesce(p_payload->>'vatNumber',''),case when v_deleted then now() else null end)
    on conflict(owner_user_id,id) do update set name=excluded.name,contact_name=excluded.contact_name,phone=excluded.phone,email=excluded.email,address=excluded.address,tax_id=excluded.tax_id,vat_number=excluded.vat_number,deleted_at=excluded.deleted_at,version=public.durability_clients.version+1,updated_at=now();
  elsif p_entity_type='CATALOG_ITEM' then
    if coalesce(length(trim(p_payload->>'title')),0)=0 or p_payload->>'priceMode' not in ('measured','body') or jsonb_typeof(p_payload->'priceCents')<>'number' or (p_payload->>'priceCents')::bigint<0 or (p_payload->>'priceMode'='measured' and (coalesce(length(trim(p_payload->>'unitCode')),0)=0 or coalesce(length(trim(p_payload->>'unitLabel')),0)=0)) then raise exception 'DURABILITY_CATALOG_INVALID' using errcode='P0001'; end if;
    insert into public.durability_catalog_items(id,owner_user_id,title,price_mode,unit_code,unit_label,price_cents,deleted_at) values(p_entity_id,v_owner,trim(p_payload->>'title'),p_payload->>'priceMode',case when p_payload->>'priceMode'='measured' then p_payload->>'unitCode' else null end,case when p_payload->>'priceMode'='measured' then p_payload->>'unitLabel' else '' end,(p_payload->>'priceCents')::bigint,case when v_deleted then now() else null end)
    on conflict(owner_user_id,id) do update set title=excluded.title,price_mode=excluded.price_mode,unit_code=excluded.unit_code,unit_label=excluded.unit_label,price_cents=excluded.price_cents,deleted_at=excluded.deleted_at,version=public.durability_catalog_items.version+1,updated_at=now();
  elsif p_entity_type='MEASUREMENT_UNIT' then
    if coalesce(length(trim(p_payload->>'label')),0)=0 or jsonb_typeof(p_payload->'isCustom')<>'boolean' then raise exception 'DURABILITY_UNIT_INVALID' using errcode='P0001'; end if;
    insert into public.durability_measurement_units(code,owner_user_id,label,is_custom,deleted_at) values(p_entity_id,v_owner,trim(p_payload->>'label'),(p_payload->>'isCustom')::boolean,case when v_deleted then now() else null end)
    on conflict(owner_user_id,code) do update set label=excluded.label,is_custom=excluded.is_custom,deleted_at=excluded.deleted_at,version=public.durability_measurement_units.version+1,updated_at=now();
  else
    if coalesce(length(trim(p_payload->>'label')),0)=0 or jsonb_typeof(p_payload->'isCustom')<>'boolean' or jsonb_typeof(p_payload->'rateBasisPoints')<>'number' or (p_payload->>'rateBasisPoints')::integer not between 0 and 100000 then raise exception 'DURABILITY_VAT_INVALID' using errcode='P0001'; end if;
    insert into public.durability_vat_rates(code,owner_user_id,label,rate_basis_points,is_custom,deleted_at) values(p_entity_id,v_owner,trim(p_payload->>'label'),(p_payload->>'rateBasisPoints')::integer,(p_payload->>'isCustom')::boolean,case when v_deleted then now() else null end)
    on conflict(owner_user_id,code) do update set label=excluded.label,rate_basis_points=excluded.rate_basis_points,is_custom=excluded.is_custom,deleted_at=excluded.deleted_at,version=public.durability_vat_rates.version+1,updated_at=now();
  end if;
  v_existing:=public.durability_record(p_entity_type,p_entity_id,v_owner);
  v_result:=jsonb_build_object('outcome','APPLIED','record',v_existing);
  insert into public.durability_sync_operations values(v_owner,p_entity_type,p_entity_id,p_operation_id,p_payload,v_result);
  return query select 'APPLIED',v_existing;
end;
$$;

revoke all on function public.durability_record(text,text,uuid) from public, anon, authenticated;
revoke all on function public.get_durability_snapshot() from public, anon;
revoke all on function public.sync_durability_entity(text,text,text,bigint,jsonb) from public, anon;
grant execute on function public.get_durability_snapshot(), public.sync_durability_entity(text,text,text,bigint,jsonb) to authenticated;
