-- The public Edge Function invokes the lifecycle guard with the service role.
grant execute on function public.assert_account_active(uuid) to service_role;
