-- Snapshot foundation functions must have an explicit client surface.
-- Trigger helpers are implementation details; only the registration RPC is callable.
revoke execute on function public.prevent_quote_issuance_snapshot_mutation() from public, anon, authenticated;

revoke execute on function public.register_quote_issuance_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.register_quote_issuance_snapshot(uuid, jsonb) to authenticated;
