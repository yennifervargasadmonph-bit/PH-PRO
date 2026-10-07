-- Emula lo mínimo de Supabase para correr las migraciones en un PostgreSQL limpio
-- (CI y desarrollo local). En Supabase real este archivo NO se aplica.
-- Cada archivo de pruebas crea su propia base, pero los roles son del servidor:
-- se toleran creaciones simultáneas.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    begin
      if not exists (select 1 from pg_roles where rolname = r) then
        execute format('create role %I nologin', r);
      end if;
    exception when duplicate_object or unique_violation then null;
    end;
  end loop;
end $$;
alter role service_role bypassrls;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated;
