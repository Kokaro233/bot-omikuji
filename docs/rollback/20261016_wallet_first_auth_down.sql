-- ROLLBACK for 20261016000001_wallet_first_auth + 20261016000002_revoke_on_sign_out.
-- Not applied automatically. Run manually (supabase db query --linked -f ...) only if
-- the wallet-first release must be reverted. It restores the 2026-10-15 policies and
-- grants. It does NOT delete user rows; wallet-auth tables are dropped (their content
-- is only short-lived nonces and session markers).
begin;

drop trigger if exists verified_draw_to_owner on public.verified_fortune_draws;
drop function if exists public.copy_verified_draw_to_owner();
drop function if exists public.import_wallet_draws(uuid);
drop function if exists public.record_guest_draw(text, smallint);

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "wallets_select_own" on public.wallets;
drop policy if exists "fortunes_select_own" on public.fortunes;
drop policy if exists "fortunes_update_own" on public.fortunes;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "wallets_select_own" on public.wallets for select to authenticated using (auth.uid() = user_id);
create policy "fortunes_select_own" on public.fortunes for select to authenticated using (auth.uid() = user_id);
create policy "fortunes_update_own" on public.fortunes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop function if exists public.private_access_ok();
drop function if exists public.has_active_wallet_session();
drop function if exists public.is_wallet_session_user();
drop table if exists public.wallet_sessions;
drop table if exists public.wallet_auth_nonces;

create policy "public_guest_draws_insert_anyone" on public.public_guest_draws for insert to anon, authenticated with check (true);
grant insert (local_id, fortune_id) on public.public_guest_draws to anon, authenticated;
-- public_guest_draws.client_hash and public.fortune_catalog are left in place (harmless).

delete from supabase_migrations.schema_migrations where version in ('20261016000001', '20261016000002');
commit;
-- Then: redeploy the previous frontend in Vercel (Deployments → Promote the 2026-10-16 build).
