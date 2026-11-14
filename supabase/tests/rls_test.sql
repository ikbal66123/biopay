-- Run after local_auth_stub.sql + the migration. Raises an exception on the first failed check.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.id', '{"full_name":"Ayu","phone_e164":"+6281234567890","country_code":"id","biometric_consent":"true","consent_version":"2026-11"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.id', '{"full_name":"Budi"}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'trigger should create 2 profiles';
  assert (select country_code from public.profiles where full_name = 'Ayu') = 'ID', 'country code uppercased';
  assert (select count(*) from public.security_settings) = 2, 'security rows created';
  assert (select count(*) from public.consents where kind = 'biometric' and version = '2026-11') = 1, 'consent recorded for Ayu only';
end $$;

-- ---- as user A ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.transactions (user_id, title, amount_idr, direction, channel, category) values
  (auth.uid(), 'Kopi', 28000, 'out', 'voice', 'Makan & kopi'),
  (auth.uid(), 'Indomaret Point', 85000, 'out', 'terminal', 'Belanja & minimarket');
insert into public.savings_goals (user_id, name, target_idr) values (auth.uid(), 'Liburan Bali', 5000000);
do $$ begin
  assert (select count(*) from public.profiles) = 1, 'A sees only own profile';
  assert (select count(*) from public.transactions) = 2, 'A sees own tx';
end $$;
-- A cannot write rows for B
do $$ begin
  begin
    insert into public.transactions (user_id, title, amount_idr, direction, channel) values ('00000000-0000-0000-0000-00000000000b', 'forged', 1000, 'out', 'app');
    raise exception 'FORGED INSERT SUCCEEDED';
  exception when insufficient_privilege then null; end;
end $$;
-- ledger is append-only: update touches nothing, terminal tx cannot be deleted, voice note can
update public.transactions set amount_idr = 1 where title = 'Indomaret Point';
delete from public.transactions where title = 'Indomaret Point';
delete from public.transactions where title = 'Kopi';
do $$ begin
  assert (select amount_idr from public.transactions where title = 'Indomaret Point') = 85000, 'update must not apply';
  assert (select count(*) from public.transactions) = 1, 'only the voice note is deletable';
end $$;
-- A cannot see or lift B's security settings
update public.security_settings set frozen = true where user_id = '00000000-0000-0000-0000-00000000000b';
reset role;
do $$ begin
  assert (select frozen from public.security_settings where user_id = '00000000-0000-0000-0000-00000000000b') = false, 'A changed B settings';
end $$;

-- ---- as user B ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.transactions) = 0, 'B must not see A tx';
  assert (select count(*) from public.savings_goals) = 0, 'B must not see A goals';
end $$;
-- assistant memory search only returns own rows
insert into public.assistant_memory (user_id, content, embedding) values (auth.uid(), 'B suka kopi', array_fill(0.1::real, array[1536])::vector);
do $$ begin assert (select count(*) from public.match_assistant_memory(array_fill(0.1::real, array[1536])::vector, 5)) = 1, 'memory match'; end $$;

-- ---- anonymous ----
reset role; set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform 1 from public.transactions; raise exception 'ANON READ SUCCEEDED';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- right to erasure ----
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.delete_my_account();
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where email = 'a@test.id'), 'auth user deleted';
  assert (select count(*) from public.transactions) = 0, 'A data cascaded';
  assert (select count(*) from public.profiles) = 1, 'B kept';
end $$;
select 'ALL RLS CHECKS PASSED' as result;
