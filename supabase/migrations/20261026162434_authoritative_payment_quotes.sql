-- Public receipt lookup intentionally returns only the computed amount and
-- placement status for an unguessable, newly submitted UUID. No PII is exposed.
create function bp_private.request_quote(p_id uuid)
returns table(amount numeric, status text)
language sql stable security definer set search_path='' as $$
 select s.amount,s.status from public.bp_submissions s
 where s.id=p_id and s.created_at>now()-interval '15 minutes';
$$;
revoke all on function bp_private.request_quote(uuid) from public;
grant execute on function bp_private.request_quote(uuid) to anon,authenticated;
create function public.bp_request_quote(p_id uuid)
returns table(amount numeric,status text)
language sql stable security invoker set search_path='' as $$
 select * from bp_private.request_quote(p_id);
$$;
revoke all on function public.bp_request_quote(uuid) from public;
grant execute on function public.bp_request_quote(uuid) to anon,authenticated;
