-- The allowlist is intentionally inaccessible through the public API.
create policy bp_admins_deny_direct_access on public.bp_admins
 for all to anon, authenticated using (false) with check (false);
-- Supabase's pre-existing event-trigger helper must never be called via RPC.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
