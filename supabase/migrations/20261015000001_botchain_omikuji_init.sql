-- BOT Omikuji: schema for its dedicated Supabase project. Every chain-derived
-- row is pinned to BOT Chain Mainnet (chain 677) and to the contract that
-- emitted it, so data from any other chain can never be stored or counted here.

-- gen_random_uuid() is built into Postgres 13+, no extension needed.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '御签守护者' check (char_length(username) between 2 and 32),
  avatar text not null default '🌸' check (char_length(avatar) <= 8),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, avatar)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), '御签守护者'), 32), '🌸')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- wallets
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  chain_id integer not null default 677 check (chain_id = 677),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (chain_id, wallet_address)
);

create table public.wallet_nonces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  chain_id integer not null check (chain_id = 677),
  nonce uuid not null unique default gen_random_uuid(),
  message text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- verified chain draws
-- Written only by Edge Functions (service role) after receipt + event + storage verification.
create table public.verified_fortune_draws (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null default 677 check (chain_id = 677),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  record_index integer not null check (record_index >= 0),
  fortune_id smallint not null check (fortune_id between 0 and 6),
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null,
  block_number numeric(78, 0) not null,
  created_at timestamptz not null,
  indexed_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  unique (chain_id, contract_address, wallet_address, record_index)
);

-- Account-owned copies of verified draws (favorites live here).
create table public.fortunes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  chain_id integer not null default 677 check (chain_id = 677),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  record_index integer not null check (record_index >= 0),
  fortune_id smallint not null check (fortune_id between 0 and 6),
  fortune_type text not null,
  rarity text not null check (rarity in ('SSR', 'SR', 'R')),
  message text not null,
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null,
  block_number numeric(78, 0) not null,
  favorite boolean not null default false,
  created_at timestamptz not null,
  unique (chain_id, tx_hash, log_index)
);

-- ---------------------------------------------------------------- off-chain guest trials
-- Guest results are generated in the browser and never touch the chain. They have
-- no transaction hash or chain id, so they cannot be mistaken for on-chain draws.
create table public.guest_fortunes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text not null check (local_id ~ '^guest-[0-9a-zA-Z-]{8,64}$'),
  fortune_id smallint not null check (fortune_id between 0 and 6),
  favorite boolean not null default false,
  created_at timestamptz not null,
  unique (user_id, local_id)
);

create table public.public_guest_draws (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique check (local_id ~ '^guest-[0-9a-zA-Z-]{8,64}$'),
  fortune_id smallint not null check (fortune_id between 0 and 6),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_nonces enable row level security;
alter table public.verified_fortune_draws enable row level security;
alter table public.fortunes enable row level security;
alter table public.guest_fortunes enable row level security;
alter table public.public_guest_draws enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "wallets_select_own" on public.wallets for select to authenticated using (auth.uid() = user_id);
create policy "fortunes_select_own" on public.fortunes for select to authenticated using (auth.uid() = user_id);
create policy "fortunes_update_own" on public.fortunes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "verified_fortune_draws_public_select" on public.verified_fortune_draws for select to anon, authenticated using (true);
create policy "guest_fortunes_select_own" on public.guest_fortunes for select to authenticated using (auth.uid() = user_id);
create policy "guest_fortunes_insert_own" on public.guest_fortunes for insert to authenticated with check (auth.uid() = user_id);
create policy "guest_fortunes_update_own" on public.guest_fortunes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public_guest_draws_insert_anyone" on public.public_guest_draws for insert to anon, authenticated with check (true);
-- wallet_nonces: no client policies; only the service role (Edge Functions) touches it.

-- Column-level grants: clients may only change cosmetic fields. Chain-derived
-- columns (fortune_id, tx_hash, wallet ...) are writable by the service role only.
revoke all on public.profiles, public.wallets, public.wallet_nonces, public.verified_fortune_draws,
  public.fortunes, public.guest_fortunes, public.public_guest_draws from anon, authenticated;
grant select on public.profiles, public.wallets, public.fortunes, public.guest_fortunes to authenticated;
grant update (username, avatar) on public.profiles to authenticated;
grant update (favorite) on public.fortunes to authenticated;
grant insert (user_id, local_id, fortune_id, favorite, created_at) on public.guest_fortunes to authenticated;
grant update (favorite) on public.guest_fortunes to authenticated;
grant select on public.verified_fortune_draws to anon, authenticated;
grant insert (local_id, fortune_id) on public.public_guest_draws to anon, authenticated;

-- ---------------------------------------------------------------- indexes
create index wallets_user_id_idx on public.wallets(user_id);
create index wallet_nonces_expiry_idx on public.wallet_nonces(expires_at) where used_at is null;
create index fortunes_user_created_idx on public.fortunes(user_id, created_at desc);
create index verified_fortune_draws_wallet_idx on public.verified_fortune_draws(contract_address, wallet_address, record_index);
create index verified_fortune_draws_created_idx on public.verified_fortune_draws(created_at desc);
create index guest_fortunes_user_created_idx on public.guest_fortunes(user_id, created_at desc);

-- ---------------------------------------------------------------- public counters
create or replace function public.get_verified_fortune_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*)::bigint from public.verified_fortune_draws where chain_id = 677;
$$;

create or replace function public.get_guest_fortune_count()
returns bigint language sql stable security definer set search_path = public as $$
  select (select count(*) from public.public_guest_draws)
       + (select count(*) from public.guest_fortunes g
          where not exists (select 1 from public.public_guest_draws p where p.local_id = g.local_id));
$$;

revoke all on function public.get_verified_fortune_count() from public;
revoke all on function public.get_guest_fortune_count() from public;
grant execute on function public.get_verified_fortune_count() to anon, authenticated;
grant execute on function public.get_guest_fortune_count() to anon, authenticated;
