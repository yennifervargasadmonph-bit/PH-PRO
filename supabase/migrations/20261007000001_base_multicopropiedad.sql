-- PH PRO · Sprint 1
-- Organizaciones, copropiedades, membresías, accesos y bitácora,
-- con aislamiento por fila (RLS) en todas las tablas.
--
-- Modelo: organización administradora -> copropiedades -> (unidades, desde el sprint 2).
-- Regla de oro: ninguna tabla con datos de una organización o copropiedad
-- existe sin RLS activo (lo verifica tests/db/aislamiento.test.ts).

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '',
  correo text not null,
  creado_en timestamptz not null default now()
);

create table public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 160),
  nit text check (nit is null or nit ~ '^[0-9]{6,12}-[0-9]$'),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id)
);

create type public.rol_organizacion as enum ('propietario', 'administrador', 'miembro');

create table public.miembros_organizacion (
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol public.rol_organizacion not null default 'miembro',
  creado_en timestamptz not null default now(),
  primary key (organizacion_id, usuario_id)
);

create type public.tipo_copropiedad as enum ('edificio', 'conjunto', 'urbanizacion', 'centro_comercial', 'mixta');

create table public.copropiedades (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete restrict,
  nombre text not null check (length(trim(nombre)) between 2 and 160),
  nit text check (nit is null or nit ~ '^[0-9]{6,12}-[0-9]$'),
  tipo public.tipo_copropiedad not null default 'edificio',
  ciudad text not null default '',
  direccion text not null default '',
  prefijo text not null check (prefijo ~ '^[A-Z0-9]{2,6}$'),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (organizacion_id, prefijo)
);

-- Roles por copropiedad. Los permisos finos por módulo llegan en el sprint 2.
create type public.rol_copropiedad as enum (
  'administradora', 'asistente', 'contador', 'revisor_fiscal', 'consejo', 'porteria'
);

create table public.accesos_copropiedad (
  copropiedad_id uuid not null references public.copropiedades (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol public.rol_copropiedad not null,
  creado_en timestamptz not null default now(),
  primary key (copropiedad_id, usuario_id)
);

-- Bitácora inmutable: solo se escribe desde triggers y nunca se edita ni borra.
create table public.bitacora (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null,
  copropiedad_id uuid,
  usuario_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id text,
  datos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index on public.copropiedades (organizacion_id);
create index on public.accesos_copropiedad (usuario_id);
create index on public.miembros_organizacion (usuario_id);
create index on public.bitacora (organizacion_id, creado_en desc);
create index on public.bitacora (copropiedad_id, creado_en desc);

-- ---------------------------------------------------------------------------
-- Funciones de autorización (security definer para no recursar en RLS)
-- ---------------------------------------------------------------------------

create or replace function app.es_miembro_org(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.miembros_organizacion m
    where m.organizacion_id = org and m.usuario_id = auth.uid()
  );
$$;

create or replace function app.es_admin_org(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.miembros_organizacion m
    where m.organizacion_id = org and m.usuario_id = auth.uid()
      and m.rol in ('propietario', 'administrador')
  );
$$;

create or replace function app.tiene_acceso_copropiedad(copro uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.accesos_copropiedad a
    where a.copropiedad_id = copro and a.usuario_id = auth.uid()
  );
$$;

-- Ve una copropiedad quien administra la organización o tiene acceso asignado.
create or replace function app.puede_ver_copropiedad(copro uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.accesos_copropiedad a
    where a.copropiedad_id = copro and a.usuario_id = auth.uid()
  ) or exists (
    select 1 from public.copropiedades c
    where c.id = copro and app.es_admin_org(c.organizacion_id)
  );
$$;

create or replace function app.org_de_copropiedad(copro uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select organizacion_id from public.copropiedades where id = copro;
$$;

-- Comparten organización (para ver el nombre de un compañero de trabajo).
create or replace function app.comparte_org(otro uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.miembros_organizacion a
    join public.miembros_organizacion b on b.organizacion_id = a.organizacion_id
    where a.usuario_id = auth.uid() and b.usuario_id = otro
  );
$$;

-- Solo se puede dar acceso a una copropiedad a quien ya es miembro de su organización.
create or replace function app.es_miembro_org_de(usuario uuid, org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.miembros_organizacion m
    where m.organizacion_id = org and m.usuario_id = usuario
  );
$$;

revoke all on function app.es_miembro_org(uuid), app.es_admin_org(uuid),
  app.puede_ver_copropiedad(uuid), app.org_de_copropiedad(uuid), app.comparte_org(uuid),
  app.es_miembro_org_de(uuid, uuid), app.tiene_acceso_copropiedad(uuid) from public;
grant execute on function app.es_miembro_org(uuid), app.es_admin_org(uuid),
  app.puede_ver_copropiedad(uuid), app.org_de_copropiedad(uuid), app.comparte_org(uuid),
  app.es_miembro_org_de(uuid, uuid), app.tiene_acceso_copropiedad(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.perfiles enable row level security;
alter table public.organizaciones enable row level security;
alter table public.miembros_organizacion enable row level security;
alter table public.copropiedades enable row level security;
alter table public.accesos_copropiedad enable row level security;
alter table public.bitacora enable row level security;

-- Perfiles: cada quien ve el suyo y los de su organización; solo edita el suyo.
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or app.comparte_org(id));
create policy perfiles_editar on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Organizaciones: se crean con app.crear_organizacion(); se ven si se es miembro.
create policy org_ver on public.organizaciones for select to authenticated
  using (app.es_miembro_org(id));
create policy org_editar on public.organizaciones for update to authenticated
  using (app.es_admin_org(id)) with check (app.es_admin_org(id));

-- Miembros: los ven los miembros; los gestionan los administradores.
create policy miembros_ver on public.miembros_organizacion for select to authenticated
  using (app.es_miembro_org(organizacion_id));
create policy miembros_crear on public.miembros_organizacion for insert to authenticated
  with check (app.es_admin_org(organizacion_id) and rol <> 'propietario');
create policy miembros_editar on public.miembros_organizacion for update to authenticated
  using (app.es_admin_org(organizacion_id) and rol <> 'propietario')
  with check (app.es_admin_org(organizacion_id) and rol <> 'propietario');
create policy miembros_quitar on public.miembros_organizacion for delete to authenticated
  using (app.es_admin_org(organizacion_id) and rol <> 'propietario');

-- Copropiedades: las ve quien tiene acceso; las crean y editan los administradores
-- de la organización. No se borran: se desactivan.
create policy copro_ver on public.copropiedades for select to authenticated
  using (app.es_admin_org(organizacion_id) or app.tiene_acceso_copropiedad(id));
create policy copro_crear on public.copropiedades for insert to authenticated
  with check (app.es_admin_org(organizacion_id));
create policy copro_editar on public.copropiedades for update to authenticated
  using (app.es_admin_org(organizacion_id)) with check (app.es_admin_org(organizacion_id));

-- Accesos: cada quien ve los suyos; los administradores ven y gestionan todos los de su organización.
create policy accesos_ver on public.accesos_copropiedad for select to authenticated
  using (usuario_id = auth.uid() or app.es_admin_org(app.org_de_copropiedad(copropiedad_id)));
create policy accesos_crear on public.accesos_copropiedad for insert to authenticated
  with check (app.es_admin_org(app.org_de_copropiedad(copropiedad_id))
              and app.es_miembro_org_de(usuario_id, app.org_de_copropiedad(copropiedad_id)));
create policy accesos_editar on public.accesos_copropiedad for update to authenticated
  using (app.es_admin_org(app.org_de_copropiedad(copropiedad_id)))
  with check (app.es_admin_org(app.org_de_copropiedad(copropiedad_id)));
create policy accesos_quitar on public.accesos_copropiedad for delete to authenticated
  using (app.es_admin_org(app.org_de_copropiedad(copropiedad_id)));

-- Bitácora: solo lectura para administradores de la organización.
create policy bitacora_ver on public.bitacora for select to authenticated
  using (app.es_admin_org(organizacion_id));

-- Permisos de tabla (las políticas deciden qué filas).
grant select, update on public.perfiles to authenticated;
grant select, update on public.organizaciones to authenticated;
grant select, insert, update, delete on public.miembros_organizacion to authenticated;
grant select, insert, update on public.copropiedades to authenticated;
grant select, insert, update, delete on public.accesos_copropiedad to authenticated;
grant select on public.bitacora to authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Operaciones con reglas propias
-- ---------------------------------------------------------------------------

-- Crea una organización y deja a quien la crea como propietario.
create or replace function public.crear_organizacion(p_nombre text, p_nit text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión iniciada' using errcode = '42501';
  end if;
  insert into public.organizaciones (nombre, nit, creado_por)
  values (trim(p_nombre), nullif(trim(p_nit), ''), auth.uid())
  returning id into v_id;
  insert into public.miembros_organizacion (organizacion_id, usuario_id, rol)
  values (v_id, auth.uid(), 'propietario');
  return v_id;
end;
$$;
revoke all on function public.crear_organizacion(text, text) from public, anon;
grant execute on function public.crear_organizacion(text, text) to authenticated;

-- Una copropiedad nunca cambia de organización.
create or replace function app.impedir_cambio_organizacion()
returns trigger language plpgsql as $$
begin
  if new.organizacion_id is distinct from old.organizacion_id then
    raise exception 'Una copropiedad no puede cambiar de organización' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger copropiedades_misma_org before update on public.copropiedades
  for each row execute function app.impedir_cambio_organizacion();

-- Perfil automático al registrarse en el proveedor de autenticación.
create or replace function app.crear_perfil()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.perfiles (id, correo, nombre)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nombre', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function app.crear_perfil();

-- ---------------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------------

create or replace function app.registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old));
  v_org uuid;
  v_copro uuid;
  v_id text;
begin
  if tg_table_name = 'organizaciones' then
    v_org := (fila ->> 'id')::uuid;
    v_id := fila ->> 'id';
  elsif tg_table_name = 'copropiedades' then
    v_org := (fila ->> 'organizacion_id')::uuid;
    v_copro := (fila ->> 'id')::uuid;
    v_id := fila ->> 'id';
  elsif tg_table_name = 'miembros_organizacion' then
    v_org := (fila ->> 'organizacion_id')::uuid;
    v_id := fila ->> 'usuario_id';
  elsif tg_table_name = 'accesos_copropiedad' then
    v_copro := (fila ->> 'copropiedad_id')::uuid;
    v_org := app.org_de_copropiedad(v_copro);
    v_id := fila ->> 'usuario_id';
  end if;

  insert into public.bitacora (organizacion_id, copropiedad_id, usuario_id, accion, entidad, entidad_id, datos)
  values (
    v_org, v_copro, auth.uid(), lower(tg_op), tg_table_name, v_id,
    case tg_op
      when 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
      else fila
    end
  );
  return coalesce(new, old);
end;
$$;

create trigger bitacora_organizaciones after insert or update on public.organizaciones
  for each row execute function app.registrar_bitacora();
create trigger bitacora_copropiedades after insert or update on public.copropiedades
  for each row execute function app.registrar_bitacora();
create trigger bitacora_miembros after insert or update or delete on public.miembros_organizacion
  for each row execute function app.registrar_bitacora();
create trigger bitacora_accesos after insert or update or delete on public.accesos_copropiedad
  for each row execute function app.registrar_bitacora();

-- La bitácora es inmutable, incluso para el dueño de la base.
create or replace function app.bitacora_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'La bitácora no se puede modificar ni borrar' using errcode = '42501';
end;
$$;
create trigger bitacora_sin_cambios before update or delete on public.bitacora
  for each row execute function app.bitacora_inmutable();
create trigger bitacora_sin_truncate before truncate on public.bitacora
  for each statement execute function app.bitacora_inmutable();
