-- Signing out deletes the row in auth.sessions, but an already-issued access token
-- stays valid until it expires. Require the session to still exist so private data
-- is cut off the moment the user signs out (verified on staging).
create or replace function public.has_active_wallet_session()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.wallet_sessions s
    join auth.sessions a on a.id = s.session_id and a.user_id = s.user_id
    where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
      and s.revoked_at is null
  );
$$;
revoke all on function public.has_active_wallet_session() from public;
grant execute on function public.has_active_wallet_session() to authenticated;
