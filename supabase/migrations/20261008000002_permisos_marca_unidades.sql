-- PH PRO · Sprint 2
-- Permisos por rol y módulo, datos de marca de la copropiedad,
-- unidades con coeficientes e importación de unidades con registro.

-- ---------------------------------------------------------------------------
-- Permisos por rol y módulo (matriz de la Fase 0, sección 5)
-- V ver · C crear · E editar · A aprobar · I inactivar · X exportar
-- Los administradores de la organización tienen todos los permisos.
-- ---------------------------------------------------------------------------

create table public.permisos_rol (
  rol public.rol_copropiedad not null,
  modulo text not null,
  acciones text[] not null,
  primary key (rol, modulo)
);

insert into public.permisos_rol (rol, modulo, acciones) values
  ('administradora', 'perfil',    '{V,C,E,I}'),
  ('administradora', 'unidades',  '{V,C,E,I,X}'),
  ('administradora', 'importar',  '{V,C,A,X}'),
  ('administradora', 'usuarios',  '{V,C,E,I}'),
  ('administradora', 'bitacora',  '{V,X}'),
  ('auxiliar',       'perfil',    '{V}'),
  ('auxiliar',       'unidades',  '{V,C,E}'),
  ('auxiliar',       'importar',  '{V,C}'),
  ('consejo',        'perfil',    '{V}'),
  ('consejo',        'unidades',  '{V}'),
  ('contador',       'perfil',    '{V}'),
  ('contador',       'unidades',  '{V}'),
  ('revisor_fiscal', 'perfil',    '{V}'),
  ('revisor_fiscal', 'unidades',  '{V}'),
  ('revisor_fiscal', 'importar',  '{V}'),
  ('revisor_fiscal', 'bitacora',  '{V,X}'),
  ('propietario',    'perfil',    '{V}'),
  ('residente',      'perfil',    '{V}'),
  ('porteria',       'unidades',  '{V}');
-- Propietarios y residentes verán solo su propia unidad cuando existan los vínculos (sprint 3).

alter table public.permisos_rol enable row level security;
create policy permisos_ver on public.permisos_rol for select to authenticated using (true);
grant select on public.permisos_rol to authenticated;

create or replace function app.puede(copro uuid, p_modulo text, p_accion text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select app.es_admin_org(app.org_de_copropiedad(copro)) or exists (
    select 1 from public.accesos_copropiedad a
    join public.permisos_rol p on p.rol = a.rol
    where a.copropiedad_id = copro and a.usuario_id = auth.uid()
      and p.modulo = p_modulo and p_accion = any (p.acciones)
  );
$$;
revoke all on function app.puede(uuid, text, text) from public;
grant execute on function app.puede(uuid, text, text) to authenticated;

-- Permisos de la persona en una copropiedad, para que la interfaz muestre solo lo que puede hacer.
create or replace function public.mis_permisos(p_copro uuid)
returns table (modulo text, acciones text[]) language sql stable security definer set search_path = public, pg_temp as $$
  select m.modulo, m.acciones from (
    select p.modulo, p.acciones from public.permisos_rol p
    join public.accesos_copropiedad a on a.rol = p.rol
    where a.copropiedad_id = p_copro and a.usuario_id = auth.uid()
      and not app.es_admin_org(app.org_de_copropiedad(p_copro))
    union all
    select distinct p.modulo, array['V','C','E','A','I','X','P'] from public.permisos_rol p
    where app.es_admin_org(app.org_de_copropiedad(p_copro))
  ) m;
$$;
revoke all on function public.mis_permisos(uuid) from public, anon;
grant execute on function public.mis_permisos(uuid) to authenticated;

-- Agrega al equipo a alguien que ya tiene cuenta. Las cuentas se crean por invitación.
create or replace function public.agregar_miembro(p_org uuid, p_correo text, p_rol public.rol_organizacion default 'miembro')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_usuario uuid;
begin
  if not app.es_admin_org(p_org) then
    raise exception 'Solo la administración puede agregar personas al equipo' using errcode = '42501';
  end if;
  if p_rol = 'propietario' then
    raise exception 'No se pueden agregar propietarios de la organización' using errcode = '42501';
  end if;
  select id into v_usuario from public.perfiles where lower(correo) = lower(trim(p_correo));
  if v_usuario is null then
    raise exception 'No hay una cuenta con ese correo' using errcode = 'P0002';
  end if;
  insert into public.miembros_organizacion (organizacion_id, usuario_id, rol)
  values (p_org, v_usuario, p_rol)
  on conflict (organizacion_id, usuario_id) do nothing;
  return v_usuario;
end;
$$;
revoke all on function public.agregar_miembro(uuid, text, public.rol_organizacion) from public, anon;
grant execute on function public.agregar_miembro(uuid, text, public.rol_organizacion) to authenticated;

-- ---------------------------------------------------------------------------
-- Datos de marca de la copropiedad (brand kit)
-- ---------------------------------------------------------------------------

create table public.marcas_copropiedad (
  copropiedad_id uuid primary key references public.copropiedades (id) on delete cascade,
  color_primario text not null default '#1f6a4f' check (color_primario ~ '^#[0-9a-fA-F]{6}$'),
  color_secundario text not null default '#8cc163' check (color_secundario ~ '^#[0-9a-fA-F]{6}$'),
  logo_ruta text,
  representante_legal text not null default '',
  correo text not null default '' check (correo = '' or correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono text not null default '',
  eslogan text not null default '' check (length(eslogan) <= 120),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

alter table public.marcas_copropiedad enable row level security;
create policy marca_ver on public.marcas_copropiedad for select to authenticated
  using (app.puede(copropiedad_id, 'perfil', 'V'));
create policy marca_editar on public.marcas_copropiedad for update to authenticated
  using (app.puede(copropiedad_id, 'perfil', 'E')) with check (app.puede(copropiedad_id, 'perfil', 'E'));
grant select, update (color_primario, color_secundario, logo_ruta, representante_legal, correo, telefono, eslogan)
  on public.marcas_copropiedad to authenticated;

-- Cada copropiedad nace con sus datos de marca por defecto.
create or replace function app.crear_marca()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.marcas_copropiedad (copropiedad_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger copropiedades_marca after insert on public.copropiedades
  for each row execute function app.crear_marca();
insert into public.marcas_copropiedad (copropiedad_id) select id from public.copropiedades on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Unidades
-- ---------------------------------------------------------------------------

create type public.tipo_unidad as enum ('apartamento', 'casa', 'local', 'oficina', 'parqueadero', 'deposito', 'otro');

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  copropiedad_id uuid not null references public.copropiedades (id) on delete restrict,
  torre text not null default '' check (length(torre) <= 20),
  numero text not null check (length(trim(numero)) between 1 and 20),
  tipo public.tipo_unidad not null default 'apartamento',
  coeficiente numeric(9, 6) not null check (coeficiente > 0 and coeficiente <= 100),
  area_m2 numeric(10, 2) check (area_m2 is null or area_m2 > 0),
  matricula_inmobiliaria text not null default '' check (length(matricula_inmobiliaria) <= 30),
  activa boolean not null default true,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (copropiedad_id, torre, numero)
);
create index on public.unidades (copropiedad_id);

alter table public.unidades enable row level security;
create policy unidades_ver on public.unidades for select to authenticated
  using (app.puede(copropiedad_id, 'unidades', 'V'));
create policy unidades_crear on public.unidades for insert to authenticated
  with check (app.puede(copropiedad_id, 'unidades', 'C'));
create policy unidades_editar on public.unidades for update to authenticated
  using (app.puede(copropiedad_id, 'unidades', 'E')) with check (app.puede(copropiedad_id, 'unidades', 'E'));
-- Las unidades no se borran: se inactivan.
grant select, insert, update on public.unidades to authenticated;

create or replace function app.unidad_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.copropiedad_id is distinct from old.copropiedad_id then
      raise exception 'Una unidad no puede cambiar de copropiedad' using errcode = '42501';
    end if;
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  end if;
  new.torre := upper(trim(new.torre));
  new.numero := upper(trim(new.numero));
  new.matricula_inmobiliaria := trim(new.matricula_inmobiliaria);
  new.actualizado_en := now();
  return new;
end;
$$;
create trigger unidades_normalizar before insert or update on public.unidades
  for each row execute function app.unidad_antes_de_guardar();

-- Suma de coeficientes de las unidades activas (debe dar 100 %).
create or replace function public.resumen_coeficientes(p_copro uuid)
returns table (unidades integer, suma numeric) language sql stable as $$
  select count(*)::integer, coalesce(sum(coeficiente), 0)
  from public.unidades where copropiedad_id = p_copro and activa;
$$;
grant execute on function public.resumen_coeficientes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Importaciones (PH PRO DATA): nada se escribe sin aprobación y todo queda registrado
-- ---------------------------------------------------------------------------

create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  copropiedad_id uuid not null references public.copropiedades (id) on delete restrict,
  tipo text not null check (tipo in ('unidades')),
  archivo text not null,
  total integer not null,
  nuevas integer not null,
  actualizadas integer not null,
  sin_cambios integer not null,
  rechazadas integer not null,
  rechazos jsonb not null default '[]'::jsonb,
  aprobado_por uuid not null,
  creado_en timestamptz not null default now()
);
create index on public.importaciones (copropiedad_id, creado_en desc);

alter table public.importaciones enable row level security;
create policy importaciones_ver on public.importaciones for select to authenticated
  using (app.puede(copropiedad_id, 'importar', 'V'));
grant select on public.importaciones to authenticated;

-- Aplica una importación de unidades ya revisada. Llave: copropiedad + torre + número.
-- Si la unidad existe se actualiza; si no, se crea. Nunca se duplica. Todo o nada.
create or replace function public.aplicar_importacion_unidades(
  p_copro uuid, p_archivo text, p_filas jsonb, p_rechazos jsonb default '[]'::jsonb
) returns public.importaciones
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f jsonb;
  v_existente public.unidades;
  v_torre text;
  v_numero text;
  v_tipo public.tipo_unidad;
  v_coef numeric;
  v_area numeric;
  v_matricula text;
  n_nuevas integer := 0;
  n_actualizadas integer := 0;
  n_iguales integer := 0;
  v_reg public.importaciones;
begin
  if not app.puede(p_copro, 'importar', 'A') then
    raise exception 'Solo la administración puede aprobar importaciones' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'La importación no tiene filas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 5000 then
    raise exception 'Máximo 5000 filas por importación' using errcode = '22023';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_torre := upper(trim(coalesce(f ->> 'torre', '')));
    v_numero := upper(trim(coalesce(f ->> 'numero', '')));
    v_tipo := coalesce(nullif(f ->> 'tipo', ''), 'apartamento')::public.tipo_unidad;
    v_coef := (f ->> 'coeficiente')::numeric;
    v_area := nullif(f ->> 'area_m2', '')::numeric;
    v_matricula := trim(coalesce(f ->> 'matricula_inmobiliaria', ''));

    select * into v_existente from public.unidades
    where copropiedad_id = p_copro and torre = v_torre and numero = v_numero;

    if not found then
      insert into public.unidades (copropiedad_id, torre, numero, tipo, coeficiente, area_m2, matricula_inmobiliaria)
      values (p_copro, v_torre, v_numero, v_tipo, v_coef, v_area, v_matricula);
      n_nuevas := n_nuevas + 1;
    elsif (v_existente.tipo, v_existente.coeficiente, v_existente.area_m2, v_existente.matricula_inmobiliaria, v_existente.activa)
          is distinct from (v_tipo, v_coef::numeric(9, 6), v_area::numeric(10, 2), v_matricula, true) then
      update public.unidades
      set tipo = v_tipo, coeficiente = v_coef, area_m2 = v_area, matricula_inmobiliaria = v_matricula, activa = true
      where id = v_existente.id;
      n_actualizadas := n_actualizadas + 1;
    else
      n_iguales := n_iguales + 1;
    end if;
  end loop;

  insert into public.importaciones (copropiedad_id, tipo, archivo, total, nuevas, actualizadas, sin_cambios, rechazadas, rechazos, aprobado_por)
  values (
    p_copro, 'unidades', left(coalesce(p_archivo, ''), 200),
    jsonb_array_length(p_filas) + jsonb_array_length(coalesce(p_rechazos, '[]'::jsonb)),
    n_nuevas, n_actualizadas, n_iguales, jsonb_array_length(coalesce(p_rechazos, '[]'::jsonb)),
    coalesce(p_rechazos, '[]'::jsonb), auth.uid()
  )
  returning * into v_reg;
  return v_reg;
end;
$$;
revoke all on function public.aplicar_importacion_unidades(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.aplicar_importacion_unidades(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Bitácora: ahora también registra marca, unidades e importaciones
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
  else
    v_copro := (fila ->> 'copropiedad_id')::uuid;
    v_org := app.org_de_copropiedad(v_copro);
    v_id := coalesce(fila ->> 'id', fila ->> 'usuario_id', fila ->> 'copropiedad_id');
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

create trigger bitacora_marcas after update on public.marcas_copropiedad
  for each row execute function app.registrar_bitacora();
create trigger bitacora_unidades after insert or update on public.unidades
  for each row execute function app.registrar_bitacora();
create trigger bitacora_importaciones after insert on public.importaciones
  for each row execute function app.registrar_bitacora();

-- La bitácora también la ve el revisor fiscal de cada copropiedad.
drop policy bitacora_ver on public.bitacora;
create policy bitacora_ver on public.bitacora for select to authenticated
  using (app.es_admin_org(organizacion_id) or (copropiedad_id is not null and app.puede(copropiedad_id, 'bitacora', 'V')));
