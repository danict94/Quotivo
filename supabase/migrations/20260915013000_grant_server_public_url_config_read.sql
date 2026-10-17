-- The owner Edge Function reads the configured public base URL server-side.
-- Mobile roles remain governed by the existing app_config policies.
grant select on table public.app_config to service_role;
