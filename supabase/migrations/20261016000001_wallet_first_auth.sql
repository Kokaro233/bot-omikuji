-- Wallet-first authentication + rate-limited guest counter.
-- Non-destructive: no table, row or user is dropped. Existing email users keep
-- working exactly as before; the stricter rules apply only to Web3 (wallet) sessions.
--
-- Why an extra "activation" step: Supabase's signInWithWeb3 checks domain, URI and
-- age (10 min) of a SIWE message but does not enforce one-time nonces (verified on a
-- staging project: the same signed message can be replayed). Private data therefore
-- requires the session to be activated by the wallet-auth Edge Function, which checks
-- a server-issued one-time nonce, chain 677 and the signature before recording the
-- session id. A replayed signature yields only an unactivated session.

-- ---------------------------------------------------------------- server-issued SIWE nonces
create table public.wallet_auth_nonces (
  nonce text primary key check (nonce ~ '^[A-Za-z0-9]{16,64}$'),
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  used_at timestamptz
);
create index wallet_auth_nonces_expiry_idx on public.wallet_auth_nonces(expires_at);

-- ---------------------------------------------------------------- activated wallet sessions
create table public.wallet_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  chain_id integer not null default 677 check (chain_id = 677),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index wallet_sessions_user_idx on public.wallet_sessions(user_id);

alter table public.wallet_auth_nonces enable row level security;
alter table public.wallet_sessions enable row level security;
revoke all on public.wallet_auth_nonces, public.wallet_sessions from anon, authenticated;

create or replace function public.is_wallet_session_user()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'web3';
$$;

-- True when the caller's current Supabase session was activated by wallet-auth.
create or replace function public.has_active_wallet_session()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wallet_sessions s
    where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
      and s.revoked_at is null
  );
$$;

-- Private-data gate: email users as before; wallet users only with an activated session.
create or replace function public.private_access_ok()
returns boolean language sql stable as $$
  select not public.is_wallet_session_user() or public.has_active_wallet_session();
$$;

revoke all on function public.has_active_wallet_session() from public;
grant execute on function public.is_wallet_session_user(), public.has_active_wallet_session(), public.private_access_ok() to authenticated;

drop policy "profiles_select_own" on public.profiles;
drop policy "profiles_update_own" on public.profiles;
drop policy "wallets_select_own" on public.wallets;
drop policy "fortunes_select_own" on public.fortunes;
drop policy "fortunes_update_own" on public.fortunes;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id and public.private_access_ok());
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id and public.private_access_ok()) with check (auth.uid() = id);
create policy "wallets_select_own" on public.wallets for select to authenticated using (auth.uid() = user_id and public.private_access_ok());
create policy "fortunes_select_own" on public.fortunes for select to authenticated using (auth.uid() = user_id and public.private_access_ok());
create policy "fortunes_update_own" on public.fortunes for update to authenticated using (auth.uid() = user_id and public.private_access_ok()) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- fortune catalog (server-side copy)
create table public.fortune_catalog (
  id smallint primary key check (id between 0 and 6),
  fortune_type text not null,
  rarity text not null check (rarity in ('SSR', 'SR', 'R')),
  message text not null
);
insert into public.fortune_catalog (id, fortune_type, rarity, message) values
  (0, 'Great Blessing', 'SSR', 'Great things are coming your way.'),
  (1, 'Rising Fortune', 'SR', 'A patient heart opens the gate.'),
  (2, 'Gentle Blessing', 'SR', 'Small joys gather into light.'),
  (3, 'Good Fortune', 'R', 'A kind encounter awaits.'),
  (4, 'Future Fortune', 'R', 'Your season will come.'),
  (5, 'Caution', 'R', 'Move gently today.'),
  (6, 'Great Caution', 'R', 'Even the darkest night passes.');
alter table public.fortune_catalog enable row level security;
create policy "fortune_catalog_read" on public.fortune_catalog for select to anon, authenticated using (true);
grant select on public.fortune_catalog to anon, authenticated;

-- ---------------------------------------------------------------- collection sync
-- Copies verified draws of a bound wallet into its owner's collection. Only rows that
-- the Edge Functions verified on chain exist in verified_fortune_draws.
create or replace function public.import_wallet_draws(p_wallet_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  imported integer;
begin
  insert into public.fortunes (user_id, wallet_id, chain_id, contract_address, record_index, fortune_id,
                               fortune_type, rarity, message, tx_hash, log_index, block_number, created_at)
  select w.user_id, w.id, v.chain_id, v.contract_address, v.record_index, v.fortune_id,
         c.fortune_type, c.rarity, c.message, v.tx_hash, v.log_index, v.block_number, v.created_at
  from public.wallets w
  join public.verified_fortune_draws v on v.wallet_address = w.wallet_address and v.chain_id = w.chain_id
  join public.fortune_catalog c on c.id = v.fortune_id
  where w.id = p_wallet_id
  on conflict (chain_id, tx_hash, log_index) do nothing;
  get diagnostics imported = row_count;
  return imported;
end;
$$;
revoke all on function public.import_wallet_draws(uuid) from public, anon, authenticated;

create or replace function public.copy_verified_draw_to_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.import_wallet_draws(w.id)
  from public.wallets w
  where w.wallet_address = new.wallet_address and w.chain_id = new.chain_id;
  return new;
end;
$$;
create trigger verified_draw_to_owner after insert on public.verified_fortune_draws
for each row execute function public.copy_verified_draw_to_owner();

-- ---------------------------------------------------------------- rate-limited guest counter
-- Guest trials are off-chain. Clients no longer insert directly; record_guest_draw()
-- limits each client (hashed IP, never stored raw) to 5 per UTC+8 day and one per 5 s.
alter table public.public_guest_draws add column if not exists client_hash text;
create index if not exists public_guest_draws_client_idx on public.public_guest_draws(client_hash, created_at desc);
revoke insert on public.public_guest_draws from anon, authenticated;
drop policy if exists "public_guest_draws_insert_anyone" on public.public_guest_draws;

create or replace function public.record_guest_draw(p_local_id text, p_fortune_id smallint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  client text := coalesce(headers ->> 'cf-connecting-ip', headers ->> 'x-real-ip',
                          split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1), 'unknown');
  client_key text := md5('omikuji-guest:' || trim(client));
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
begin
  if p_local_id !~ '^guest-[0-9a-zA-Z-]{8,64}$' or p_fortune_id not between 0 and 6 then
    return false;
  end if;
  if exists (select 1 from public.public_guest_draws where client_hash = client_key and created_at > now() - interval '5 seconds') then
    return false;
  end if;
  if (select count(*) from public.public_guest_draws where client_hash = client_key and created_at >= day_start) >= 5 then
    return false;
  end if;
  insert into public.public_guest_draws (local_id, fortune_id, client_hash)
  values (p_local_id, p_fortune_id, client_key)
  on conflict (local_id) do nothing;
  return found;
end;
$$;
revoke all on function public.record_guest_draw(text, smallint) from public;
grant execute on function public.record_guest_draw(text, smallint) to anon, authenticated;
