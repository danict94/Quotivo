delete from public.entitlement_grants
where access_level = 'FREE' and source = 'SIGNUP';

update public.entitlement_grants
set source = case access_level
  when 'FOUNDER' then 'FOUNDER'
  when 'ADMIN_GIFT' then 'ADMIN_GIFT'
  when 'INTERNAL' then 'INTERNAL'
  else source
end;

update public.entitlement_grants
set source = 'PURCHASE'
where access_level = 'PRO' and source not in ('PURCHASE', 'INTERNAL', 'ADMIN_GIFT', 'SPONSOR', 'FOUNDER', 'ESIGENTA_COUPON');

update public.entitlement_grants
set access_level = 'PRO'
where access_level in ('FOUNDER', 'ADMIN_GIFT', 'INTERNAL');

alter table public.entitlement_grants
  drop constraint entitlement_grants_access_level_check,
  add constraint entitlement_grants_access_level_check check (access_level in ('FREE', 'PRO')),
  add constraint entitlement_grants_source_check check (source in ('PURCHASE', 'INTERNAL', 'ADMIN_GIFT', 'SPONSOR', 'FOUNDER', 'ESIGENTA_COUPON'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.entitlements (user_id, plan, source, status)
  values (new.id, 'FREE', 'SIGNUP', 'ACTIVE') on conflict (user_id) do nothing;
  return new;
end;
$$;
