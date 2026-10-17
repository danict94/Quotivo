-- Public quote handling is performed only by the server-side Edge Function.
-- Keep anon/authenticated direct table access denied; service_role bypasses RLS
-- but still needs explicit table ACLs in this project.
grant select, update on table public.quote_shares to service_role;
grant select on table public.quote_share_snapshots to service_role;
