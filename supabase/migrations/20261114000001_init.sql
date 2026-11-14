-- BioPay: initial schema for Supabase (Postgres 15+).
-- Every table is protected by Row Level Security: a signed-in user can only reach their own rows.
-- Biometric images are NEVER stored here. biometric_enrollments only keeps a reference to an
-- encrypted template held by the biometric provider, plus a hash for integrity checks (UU PDP).

create extension if not exists vector;      -- pgvector, for the finance assistant's memory (replaces Pinecone)
create extension if not exists pgcrypto;    -- gen_random_uuid(), digest()

-- ---------- helpers ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------- profiles (1 row per auth user) ----------
create table public.profiles (
    id            uuid primary key references auth.users(id) on delete cascade,
    full_name     text not null default '' check (char_length(full_name) <= 120),
    phone_e164    text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    country_code  char(2),
    doc_type      text check (doc_type in ('ktp','passport','nric','mykad','thai_id','other')),
    doc_last4     text check (doc_last4 ~ '^[0-9A-Za-z]{1,4}$'),
    bio_id        text unique not null default lpad((floor(random() * 90000) + 10000)::int::text, 5, '0'),
    language      text not null default 'id' check (language in ('id','en','ja')),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ---------- consent records (explicit, versioned, revocable) ----------
create table public.consents (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    kind        text not null check (kind in ('biometric','privacy_policy','terms','marketing')),
    version     text not null,
    granted     boolean not null,
    created_at  timestamptz not null default now(),
    revoked_at  timestamptz
);
create index consents_user_idx on public.consents (user_id, kind, created_at desc);

-- ---------- biometric enrollments (reference only, never images) ----------
create table public.biometric_enrollments (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users(id) on delete cascade,
    modality         text not null check (modality in ('face','palm')),
    provider         text not null,                 -- e.g. the licensed biometric vendor
    template_ref     text not null,                 -- opaque id of the encrypted template at the provider
    template_sha256  text check (template_sha256 ~ '^[0-9a-f]{64}$'),
    created_at       timestamptz not null default now(),
    revoked_at       timestamptz
);
create unique index biometric_active_uniq on public.biometric_enrollments (user_id, modality) where revoked_at is null;

-- ---------- linked funding sources (BioPay is a bridge: money stays at the wallet/bank) ----------
create table public.funding_sources (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    kind          text not null check (kind in ('ewallet','bank','card','paylater')),
    provider      text not null,                    -- partner identifier
    display_name  text not null,
    masked_ref    text,                             -- e.g. '•••• 4821', never a full account number
    is_primary    boolean not null default false,
    status        text not null default 'linked' check (status in ('linked','paused','unlinked')),
    linked_at     timestamptz not null default now()
);
create unique index funding_one_primary on public.funding_sources (user_id) where is_primary and status = 'linked';

-- ---------- transactions (append-only ledger of what BioPay routed or the user recorded) ----------
create table public.transactions (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users(id) on delete cascade,
    occurred_at    timestamptz not null default now(),
    title          text not null check (char_length(title) <= 160),
    category       text not null default 'Lainnya',
    amount_idr     bigint not null check (amount_idr > 0),
    direction      text not null check (direction in ('out','in','move')),
    channel        text not null check (channel in ('terminal','qr','atm','transfer','bill','topup','fx','manual','voice','app')),
    source_id      uuid references public.funding_sources(id) on delete set null,
    wallet_label   text,
    reference      text,
    meta           jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now()
);
create index transactions_user_time_idx on public.transactions (user_id, occurred_at desc);

-- ---------- budgets, savings, security, rewards ----------
create table public.budgets (
    user_id            uuid not null references auth.users(id) on delete cascade,
    category           text not null,
    monthly_limit_idr  bigint not null check (monthly_limit_idr > 0),
    primary key (user_id, category)
);

create table public.savings_goals (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null check (char_length(name) <= 80),
    target_idr  bigint not null check (target_idr > 0),
    saved_idr   bigint not null default 0 check (saved_idr >= 0),
    icon        text not null default 'ph-piggy-bank',
    created_at  timestamptz not null default now()
);

create table public.security_settings (
    user_id           uuid primary key references auth.users(id) on delete cascade,
    frozen            boolean not null default false,
    per_tx_limit_idr  bigint check (per_tx_limit_idr is null or per_tx_limit_idr > 0),
    night_guard       boolean not null default true,
    updated_at        timestamptz not null default now()
);
create trigger security_touch before update on public.security_settings for each row execute function public.touch_updated_at();

create table public.reward_ledger (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users(id) on delete cascade,
    points      integer not null check (points <> 0),
    reason      text not null,
    created_at  timestamptz not null default now()
);
create view public.reward_balance with (security_invoker = true) as
    select user_id, coalesce(sum(points), 0)::bigint as points from public.reward_ledger group by user_id;

-- ---------- finance assistant memory (pgvector) ----------
create table public.assistant_memory (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users(id) on delete cascade,
    content     text not null check (char_length(content) <= 2000),
    embedding   vector(1536),
    created_at  timestamptz not null default now()
);
create index assistant_memory_user_idx on public.assistant_memory (user_id);

-- Nearest memories for the signed-in user only (runs with the caller's rights, so RLS applies).
create or replace function public.match_assistant_memory(query_embedding vector(1536), match_count int default 5)
returns table (id bigint, content text, similarity float)
language sql stable security invoker set search_path = public as $$
    select m.id, m.content, 1 - (m.embedding <=> query_embedding) as similarity
    from public.assistant_memory m
    where m.user_id = auth.uid() and m.embedding is not null
    order by m.embedding <=> query_embedding
    limit least(greatest(match_count, 1), 20);
$$;

-- ---------- audit log (insert + read own, never edit) ----------
create table public.audit_log (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users(id) on delete cascade,
    action      text not null,
    detail      jsonb not null default '{}'::jsonb,
    at          timestamptz not null default now()
);
create index audit_user_idx on public.audit_log (user_id, at desc);

-- ---------- new user bootstrap ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, full_name, phone_e164, country_code, language)
    values (new.id,
            coalesce(left(new.raw_user_meta_data->>'full_name', 120), ''),
            nullif(new.raw_user_meta_data->>'phone_e164', ''),
            nullif(upper(left(new.raw_user_meta_data->>'country_code', 2)), ''),
            coalesce(nullif(new.raw_user_meta_data->>'language', ''), 'id'));
    insert into public.security_settings (user_id) values (new.id);
    -- Consent given in the sign-up form is recorded server-side, with its version.
    if new.raw_user_meta_data->>'biometric_consent' = 'true' then
        insert into public.consents (user_id, kind, version, granted)
        values (new.id, 'biometric', coalesce(nullif(new.raw_user_meta_data->>'consent_version', ''), 'unversioned'), true);
    end if;
    insert into public.audit_log (user_id, action) values (new.id, 'account_created');
    return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Self-service deletion: removes the auth user, every table cascades (right to erasure).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Row Level Security ----------
alter table public.profiles              enable row level security;
alter table public.consents              enable row level security;
alter table public.biometric_enrollments enable row level security;
alter table public.funding_sources       enable row level security;
alter table public.transactions          enable row level security;
alter table public.budgets               enable row level security;
alter table public.savings_goals         enable row level security;
alter table public.security_settings     enable row level security;
alter table public.reward_ledger         enable row level security;
alter table public.assistant_memory      enable row level security;
alter table public.audit_log             enable row level security;

create policy "own profile: read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile: update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own consents: read"   on public.consents for select to authenticated using (user_id = auth.uid());
create policy "own consents: add"    on public.consents for insert to authenticated with check (user_id = auth.uid());
create policy "own consents: revoke" on public.consents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Enrollments are written by the server (service role) after the provider confirms; users can read and revoke.
create policy "own enrollments: read"   on public.biometric_enrollments for select to authenticated using (user_id = auth.uid());
create policy "own enrollments: revoke" on public.biometric_enrollments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own sources: all" on public.funding_sources for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own tx: read"  on public.transactions for select to authenticated using (user_id = auth.uid());
create policy "own tx: add"   on public.transactions for insert to authenticated with check (user_id = auth.uid());
create policy "own tx: delete manual notes" on public.transactions for delete to authenticated using (user_id = auth.uid() and channel in ('manual','voice'));

create policy "own budgets: all"  on public.budgets           for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own goals: all"    on public.savings_goals     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own security: read"   on public.security_settings for select to authenticated using (user_id = auth.uid());
create policy "own security: update" on public.security_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rewards: read" on public.reward_ledger     for select to authenticated using (user_id = auth.uid());
create policy "own memory: all"   on public.assistant_memory  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own audit: read"   on public.audit_log for select to authenticated using (user_id = auth.uid());
create policy "own audit: add"    on public.audit_log for insert to authenticated with check (user_id = auth.uid());

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
