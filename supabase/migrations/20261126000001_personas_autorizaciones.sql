-- PH PRO · Sprint 3
-- Personas vinculadas a unidades, autorización de tratamiento de datos (Ley 1581 de 2012),
-- expediente básico de unidad y residentes para portería.
--
-- Una persona se registra una vez por copropiedad (la copropiedad es la responsable del
-- tratamiento) y se vincula a una o varias unidades con fecha de inicio y de fin.
--
-- Dónde vive cada dato:
--   personas               nombre y estado: lo ve quien tiene «personas V»
--   personas_datos         documento, correo, celular y teléfono: solo «datos_personales V»
--   vinculos_unidad        propietario, residente, arrendatario, apoderado o autorizado, con fechas
--   politicas_tratamiento  versiones del texto de la política y su plazo de conservación
--   autorizaciones_datos   autorización de cada persona: fecha, canal, versión, quién la registró
--                          y, si la revoca, cuándo, por qué canal y quién lo registró
-- Portería no lee estas tablas: usa residentes_porteria(), que entrega solo nombres y unidad.

-- ---------------------------------------------------------------------------
-- Permisos (matriz de la Fase 0, fila «Unidades y personas»)
-- ---------------------------------------------------------------------------

insert into public.permisos_rol (rol, modulo, acciones) values
  ('administradora', 'personas',         '{V,C,E,A,I,X}'),
  ('auxiliar',       'personas',         '{V,C,E}'),
  ('consejo',        'personas',         '{V}'),
  ('contador',       'personas',         '{V}'),
  ('revisor_fiscal', 'personas',         '{V}'),
  -- Documento y contacto: solo quien atiende a las personas. Consejo, contador y revisor
  -- fiscal ven nombres y vínculos, sin datos de contacto.
  ('administradora', 'datos_personales', '{V}'),
  ('auxiliar',       'datos_personales', '{V}'),
  -- Listado de residentes y autorizados para la portería (solo nombres y unidad).
  ('administradora', 'porteria',         '{V}'),
  ('auxiliar',       'porteria',         '{V}'),
  ('porteria',       'porteria',         '{V}');

-- Para las llaves compuestas (una persona y una unidad de la misma copropiedad).
alter table public.unidades add constraint unidades_id_copropiedad unique (id, copropiedad_id);

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------

create type public.tipo_documento as enum ('CC', 'CE', 'TI', 'PA', 'PPT', 'NIT', 'otro');
create type public.tipo_vinculo as enum ('propietario', 'residente', 'arrendatario', 'apoderado', 'autorizado');
create type public.canal_autorizacion as enum ('escrito', 'formulario_web', 'correo', 'whatsapp', 'verbal_grabada');

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  copropiedad_id uuid not null references public.copropiedades (id) on delete restrict,
  tipo_persona text not null default 'natural' check (tipo_persona in ('natural', 'juridica')),
  -- Nombre completo o razón social.
  nombre text not null check (char_length(btrim(nombre)) between 2 and 160),
  activa boolean not null default true,
  -- Plazo de conservación (Ley 1581): lo calcula la base al terminar todos sus vínculos.
  conservar_hasta date,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (id, copropiedad_id)
);
create index on public.personas (copropiedad_id, nombre);

create table public.personas_datos (
  persona_id uuid primary key,
  copropiedad_id uuid not null,
  tipo_documento public.tipo_documento,
  numero_documento text check (numero_documento is null or numero_documento ~ '^[0-9A-Z-]{3,20}$'),
  correo text check (correo is null or (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(correo) <= 160)),
  celular text check (celular is null or celular ~ '^3[0-9]{9}$'),
  telefono text check (telefono is null or telefono ~ '^[0-9]{7,10}$'),
  actualizado_en timestamptz not null default now(),
  foreign key (persona_id, copropiedad_id) references public.personas (id, copropiedad_id) on delete cascade,
  check ((tipo_documento is null) = (numero_documento is null))
);
-- Registrar una vez: un documento no se repite dentro de la copropiedad.
create unique index personas_documento_unico on public.personas_datos (copropiedad_id, tipo_documento, numero_documento)
  where numero_documento is not null;

-- ---------------------------------------------------------------------------
-- Vínculos con unidades
-- ---------------------------------------------------------------------------

create table public.vinculos_unidad (
  id uuid primary key default gen_random_uuid(),
  copropiedad_id uuid not null,
  unidad_id uuid not null,
  persona_id uuid not null,
  tipo public.tipo_vinculo not null,
  -- Titular de la unidad: el propietario que responde por ella (uno vigente por unidad).
  es_titular boolean not null default false,
  -- Vive en la unidad (lo que ve portería).
  reside boolean not null default false,
  -- Sin fecha conocida se deja vacía y la pantalla muestra «Dato faltante».
  desde date,
  hasta date,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (unidad_id, copropiedad_id) references public.unidades (id, copropiedad_id),
  foreign key (persona_id, copropiedad_id) references public.personas (id, copropiedad_id),
  check (hasta is null or desde is null or hasta >= desde),
  check (not es_titular or tipo = 'propietario')
);
create index on public.vinculos_unidad (unidad_id);
create index on public.vinculos_unidad (persona_id);
create index on public.vinculos_unidad (copropiedad_id);
create unique index vinculos_un_titular on public.vinculos_unidad (unidad_id) where es_titular and hasta is null;
create unique index vinculos_sin_repetir on public.vinculos_unidad (unidad_id, persona_id, tipo) where hasta is null;

-- ---------------------------------------------------------------------------
-- Política de tratamiento y autorizaciones (Ley 1581 de 2012, Decreto 1377 de 2013)
-- ---------------------------------------------------------------------------

-- Cada versión del texto queda tal como se aprobó: no se edita, se publica una nueva.
create table public.politicas_tratamiento (
  id uuid primary key default gen_random_uuid(),
  copropiedad_id uuid not null references public.copropiedades (id) on delete restrict,
  version text not null check (version ~ '^[0-9A-Za-z._-]{1,20}$'),
  vigente_desde date not null,
  -- Meses que se conservan los datos después de terminar el último vínculo.
  meses_conservacion integer not null check (meses_conservacion between 1 and 600),
  texto text not null check (char_length(btrim(texto)) between 50 and 50000),
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  unique (copropiedad_id, version),
  unique (id, copropiedad_id)
);

create table public.autorizaciones_datos (
  id uuid primary key default gen_random_uuid(),
  copropiedad_id uuid not null,
  persona_id uuid not null,
  politica_id uuid not null,
  canal public.canal_autorizacion not null,
  otorgada_en date not null,
  finalidades text[] not null check (
    cardinality(finalidades) > 0
    and finalidades <@ array['administracion', 'comunicaciones', 'cobranza', 'seguridad']
  ),
  registrada_por uuid default auth.uid(),
  registrada_en timestamptz not null default now(),
  -- Revocación: una sola vez y no se deshace.
  revocada_en date,
  revocacion_canal public.canal_autorizacion,
  revocada_por uuid,
  revocacion_registrada_en timestamptz,
  foreign key (persona_id, copropiedad_id) references public.personas (id, copropiedad_id),
  foreign key (politica_id, copropiedad_id) references public.politicas_tratamiento (id, copropiedad_id),
  check ((revocada_en is null) = (revocacion_canal is null)),
  check (revocada_en is null or revocada_en >= otorgada_en)
);
create index on public.autorizaciones_datos (persona_id);
create index on public.autorizaciones_datos (copropiedad_id);

-- ---------------------------------------------------------------------------
-- Reglas al guardar
-- ---------------------------------------------------------------------------

create or replace function app.persona_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.copropiedad_id is distinct from old.copropiedad_id then
      raise exception 'Una persona no puede cambiar de copropiedad' using errcode = '42501';
    end if;
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  else
    new.creado_por := coalesce(auth.uid(), new.creado_por);
    new.creado_en := now();
    new.conservar_hasta := null;
  end if;
  new.nombre := regexp_replace(btrim(new.nombre), '\s+', ' ', 'g');
  new.actualizado_en := now();
  return new;
end;
$$;
create trigger personas_normalizar before insert or update on public.personas
  for each row execute function app.persona_antes_de_guardar();

create or replace function app.datos_persona_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.persona_id is distinct from old.persona_id or new.copropiedad_id is distinct from old.copropiedad_id) then
    raise exception 'Los datos no pueden pasar a otra persona' using errcode = '42501';
  end if;
  new.numero_documento := nullif(upper(regexp_replace(coalesce(new.numero_documento, ''), '[\s.]', '', 'g')), '');
  new.correo := nullif(lower(btrim(coalesce(new.correo, ''))), '');
  new.celular := nullif(regexp_replace(coalesce(new.celular, ''), '\D', '', 'g'), '');
  new.telefono := nullif(regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g'), '');
  new.actualizado_en := now();
  return new;
end;
$$;
create trigger personas_datos_normalizar before insert or update on public.personas_datos
  for each row execute function app.datos_persona_antes_de_guardar();

-- Un vínculo no cambia de unidad, persona ni tipo: se termina (fecha «hasta») y se crea otro.
create or replace function app.vinculo_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if (new.copropiedad_id, new.unidad_id, new.persona_id, new.tipo)
       is distinct from (old.copropiedad_id, old.unidad_id, old.persona_id, old.tipo) then
      raise exception 'Un vínculo no cambia de unidad, persona ni tipo: termínalo y crea uno nuevo' using errcode = '42501';
    end if;
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  else
    new.creado_por := coalesce(auth.uid(), new.creado_por);
    new.creado_en := now();
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
create trigger vinculos_normalizar before insert or update on public.vinculos_unidad
  for each row execute function app.vinculo_antes_de_guardar();

-- Plazo de conservación: si la persona ya no tiene vínculos abiertos, fin del último vínculo
-- más los meses de la política vigente. Sin política queda vacío («Dato faltante»).
create or replace function app.recalcular_conservacion(p_persona uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_copro uuid;
  v_fin date;
  v_meses integer;
  v_hasta date;
begin
  select copropiedad_id into v_copro from public.personas where id = p_persona;
  if v_copro is null then
    return;
  end if;
  if not exists (select 1 from public.vinculos_unidad where persona_id = p_persona and hasta is null) then
    select max(hasta) into v_fin from public.vinculos_unidad where persona_id = p_persona;
    select meses_conservacion into v_meses from public.politicas_tratamiento
    where copropiedad_id = v_copro order by vigente_desde desc, creado_en desc limit 1;
    if v_fin is not null and v_meses is not null then
      v_hasta := (v_fin + make_interval(months => v_meses))::date;
    end if;
  end if;
  update public.personas set conservar_hasta = v_hasta
  where id = p_persona and conservar_hasta is distinct from v_hasta;
end;
$$;
revoke all on function app.recalcular_conservacion(uuid) from public;

create or replace function app.vinculo_despues_de_guardar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.recalcular_conservacion(new.persona_id);
  return new;
end;
$$;
create trigger vinculos_conservacion after insert or update on public.vinculos_unidad
  for each row execute function app.vinculo_despues_de_guardar();

create or replace function app.politica_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  new.creado_por := coalesce(auth.uid(), new.creado_por);
  new.creado_en := now();
  new.texto := btrim(new.texto);
  return new;
end;
$$;
create trigger politicas_normalizar before insert on public.politicas_tratamiento
  for each row execute function app.politica_antes_de_guardar();

-- La autorización se registra una vez; después solo se puede revocar (y no se deshace).
create or replace function app.autorizacion_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.otorgada_en > current_date then
      raise exception 'La fecha de la autorización no puede ser futura' using errcode = '22023';
    end if;
    if new.revocada_en is not null or new.revocacion_canal is not null then
      raise exception 'Registra primero la autorización y después su revocación' using errcode = '22023';
    end if;
    new.registrada_por := coalesce(auth.uid(), new.registrada_por);
    new.registrada_en := now();
    new.revocada_por := null;
    new.revocacion_registrada_en := null;
    select array_agg(distinct f order by f) into new.finalidades from unnest(new.finalidades) f;
    return new;
  end if;

  if old.revocada_en is not null then
    raise exception 'La autorización ya fue revocada' using errcode = '42501';
  end if;
  if (new.copropiedad_id, new.persona_id, new.politica_id, new.canal, new.otorgada_en, new.finalidades,
      new.registrada_por, new.registrada_en)
     is distinct from (old.copropiedad_id, old.persona_id, old.politica_id, old.canal, old.otorgada_en, old.finalidades,
      old.registrada_por, old.registrada_en) then
    raise exception 'Una autorización registrada no se modifica; solo se puede revocar' using errcode = '42501';
  end if;
  if new.revocada_en is null then
    raise exception 'Indica la fecha de la revocación' using errcode = '22023';
  end if;
  if new.revocada_en > current_date then
    raise exception 'La fecha de la revocación no puede ser futura' using errcode = '22023';
  end if;
  new.revocada_por := auth.uid();
  new.revocacion_registrada_en := now();
  return new;
end;
$$;
create trigger autorizaciones_reglas before insert or update on public.autorizaciones_datos
  for each row execute function app.autorizacion_antes_de_guardar();

-- ---------------------------------------------------------------------------
-- RLS: cada política usa las columnas de la propia fila (copropiedad_id), nunca una
-- función que vuelva a consultar la misma tabla (rompería INSERT … RETURNING).
-- ---------------------------------------------------------------------------

alter table public.personas enable row level security;
alter table public.personas_datos enable row level security;
alter table public.vinculos_unidad enable row level security;
alter table public.politicas_tratamiento enable row level security;
alter table public.autorizaciones_datos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['personas', 'personas_datos', 'vinculos_unidad', 'politicas_tratamiento', 'autorizaciones_datos'] loop
    execute format(
      'create policy exigir_mfa on public.%I as restrictive for all to authenticated
         using ((select app.mfa_cumplida())) with check ((select app.mfa_cumplida()))', t);
  end loop;
end $$;

create policy personas_ver on public.personas for select to authenticated
  using (app.puede(copropiedad_id, 'personas', 'V'));
create policy personas_crear on public.personas for insert to authenticated
  with check (app.puede(copropiedad_id, 'personas', 'C'));
create policy personas_editar on public.personas for update to authenticated
  using (app.puede(copropiedad_id, 'personas', 'E')) with check (app.puede(copropiedad_id, 'personas', 'E'));

create policy personas_datos_ver on public.personas_datos for select to authenticated
  using (app.puede(copropiedad_id, 'datos_personales', 'V'));
create policy personas_datos_crear on public.personas_datos for insert to authenticated
  with check (app.puede(copropiedad_id, 'personas', 'C') and app.puede(copropiedad_id, 'datos_personales', 'V'));
create policy personas_datos_editar on public.personas_datos for update to authenticated
  using (app.puede(copropiedad_id, 'personas', 'E') and app.puede(copropiedad_id, 'datos_personales', 'V'))
  with check (app.puede(copropiedad_id, 'personas', 'E') and app.puede(copropiedad_id, 'datos_personales', 'V'));

create policy vinculos_ver on public.vinculos_unidad for select to authenticated
  using (app.puede(copropiedad_id, 'personas', 'V'));
create policy vinculos_crear on public.vinculos_unidad for insert to authenticated
  with check (app.puede(copropiedad_id, 'personas', 'C'));
create policy vinculos_editar on public.vinculos_unidad for update to authenticated
  using (app.puede(copropiedad_id, 'personas', 'E')) with check (app.puede(copropiedad_id, 'personas', 'E'));

create policy politicas_ver on public.politicas_tratamiento for select to authenticated
  using (app.puede(copropiedad_id, 'personas', 'V'));
create policy politicas_crear on public.politicas_tratamiento for insert to authenticated
  with check (app.puede(copropiedad_id, 'personas', 'A'));

create policy autorizaciones_ver on public.autorizaciones_datos for select to authenticated
  using (app.puede(copropiedad_id, 'personas', 'V'));
create policy autorizaciones_crear on public.autorizaciones_datos for insert to authenticated
  with check (app.puede(copropiedad_id, 'personas', 'C'));
create policy autorizaciones_revocar on public.autorizaciones_datos for update to authenticated
  using (app.puede(copropiedad_id, 'personas', 'E')) with check (app.puede(copropiedad_id, 'personas', 'E'));

-- Nada se borra: personas y vínculos se inactivan o terminan; autorizaciones se revocan.
grant select on public.personas, public.personas_datos, public.vinculos_unidad,
  public.politicas_tratamiento, public.autorizaciones_datos to authenticated;
grant insert (copropiedad_id, tipo_persona, nombre) on public.personas to authenticated;
grant update (tipo_persona, nombre, activa) on public.personas to authenticated;
grant insert (persona_id, copropiedad_id, tipo_documento, numero_documento, correo, celular, telefono)
  on public.personas_datos to authenticated;
grant update (tipo_documento, numero_documento, correo, celular, telefono) on public.personas_datos to authenticated;
grant insert (copropiedad_id, unidad_id, persona_id, tipo, es_titular, reside, desde, hasta)
  on public.vinculos_unidad to authenticated;
grant update (es_titular, reside, desde, hasta) on public.vinculos_unidad to authenticated;
grant insert (copropiedad_id, version, vigente_desde, meses_conservacion, texto)
  on public.politicas_tratamiento to authenticated;
grant insert (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades)
  on public.autorizaciones_datos to authenticated;
grant update (revocada_en, revocacion_canal) on public.autorizaciones_datos to authenticated;
revoke all on public.personas, public.personas_datos, public.vinculos_unidad,
  public.politicas_tratamiento, public.autorizaciones_datos from anon;

-- ---------------------------------------------------------------------------
-- Registrar una persona con sus datos en un solo paso (todo o nada)
-- ---------------------------------------------------------------------------

create or replace function public.registrar_persona(
  p_copro uuid,
  p_nombre text,
  p_tipo_persona text default 'natural',
  p_tipo_documento public.tipo_documento default null,
  p_numero_documento text default null,
  p_correo text default null,
  p_celular text default null,
  p_telefono text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_datos boolean := coalesce(nullif(btrim(p_numero_documento), ''), nullif(btrim(p_correo), ''),
                              nullif(btrim(p_celular), ''), nullif(btrim(p_telefono), '')) is not null;
  v_doc text := nullif(upper(regexp_replace(coalesce(p_numero_documento, ''), '[\s.]', '', 'g')), '');
begin
  perform app.exigir_mfa();
  if p_copro is null or not app.puede(p_copro, 'personas', 'C') then
    raise exception 'No tienes permiso para registrar personas' using errcode = '42501';
  end if;
  if v_datos and not app.puede(p_copro, 'datos_personales', 'V') then
    raise exception 'No tienes permiso para registrar datos de contacto' using errcode = '42501';
  end if;
  if v_doc is not null and exists (
    select 1 from public.personas_datos
    where copropiedad_id = p_copro and tipo_documento = p_tipo_documento and numero_documento = v_doc
  ) then
    raise exception 'Ya existe una persona con ese documento' using errcode = '23505';
  end if;

  insert into public.personas (copropiedad_id, tipo_persona, nombre)
  values (p_copro, coalesce(p_tipo_persona, 'natural'), p_nombre)
  returning id into v_id;
  if v_datos or p_tipo_documento is not null then
    insert into public.personas_datos (persona_id, copropiedad_id, tipo_documento, numero_documento, correo, celular, telefono)
    values (v_id, p_copro, p_tipo_documento, v_doc, p_correo, p_celular, p_telefono);
  end if;
  return v_id;
end;
$$;
revoke all on function public.registrar_persona(uuid, text, text, public.tipo_documento, text, text, text, text) from public, anon;
grant execute on function public.registrar_persona(uuid, text, text, public.tipo_documento, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Portería: solo nombres de residentes y autorizados vigentes, con su unidad.
-- Sin documento, correo, celular ni teléfono (Fase 0: «portería ve nombre y unidad»).
-- ---------------------------------------------------------------------------

create or replace function public.residentes_porteria(p_copro uuid)
returns table (unidad_id uuid, torre text, numero text, nombre text, vinculo public.tipo_vinculo)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.exigir_mfa();
  if p_copro is null or not app.puede(p_copro, 'porteria', 'V') then
    raise exception 'No tienes permiso para ver el listado de portería' using errcode = '42501';
  end if;
  return query
  select u.id, u.torre, u.numero, p.nombre, v.tipo
  from public.vinculos_unidad v
  join public.personas p on p.id = v.persona_id
  join public.unidades u on u.id = v.unidad_id
  where v.copropiedad_id = p_copro and u.activa and p.activa
    and (v.reside or v.tipo = 'autorizado')
    and (v.desde is null or v.desde <= current_date)
    and (v.hasta is null or v.hasta >= current_date)
  order by u.torre, u.numero, p.nombre;
end;
$$;
revoke all on function public.residentes_porteria(uuid) from public, anon;
grant execute on function public.residentes_porteria(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Historial de una unidad para su expediente (desde la bitácora, ya sin datos personales)
-- ---------------------------------------------------------------------------

create or replace function public.historial_unidad(p_unidad uuid)
returns table (creado_en timestamptz, accion text, entidad text, tipo text, cambios jsonb, autor text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_copro uuid;
begin
  perform app.exigir_mfa();
  select u.copropiedad_id into v_copro from public.unidades u where u.id = p_unidad;
  if v_copro is null or not app.puede(v_copro, 'personas', 'V') then
    raise exception 'No tienes permiso para ver el expediente' using errcode = '42501';
  end if;
  return query
  select b.creado_en, b.accion, b.entidad,
         case when b.entidad = 'vinculos_unidad' then coalesce(b.datos ->> 'tipo', b.datos -> 'despues' ->> 'tipo') end,
         coalesce(b.datos -> 'cambios', '[]'::jsonb),
         nullif(pf.nombre, '')
  from public.bitacora b
  left join public.perfiles pf on pf.id = b.usuario_id
  where b.copropiedad_id = v_copro
    and ((b.entidad = 'unidades' and b.entidad_id = p_unidad::text)
      or (b.entidad = 'vinculos_unidad'
          and coalesce(b.datos ->> 'unidad_id', b.datos -> 'despues' ->> 'unidad_id') = p_unidad::text))
  order by b.creado_en desc, b.id desc
  limit 100;
end;
$$;
revoke all on function public.historial_unidad(uuid) from public, anon;
grant execute on function public.historial_unidad(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bitácora: campos que se registran con su valor. Nombre, documento, correo, celular,
-- teléfono y el texto de la política quedan como [dato personal].
-- ---------------------------------------------------------------------------

insert into app.bitacora_campos (tabla, campo)
select t, unnest(c) from (values
  ('personas',              array['id', 'copropiedad_id', 'tipo_persona', 'activa', 'conservar_hasta',
                                  'creado_por', 'creado_en', 'actualizado_en']),
  ('personas_datos',        array['persona_id', 'copropiedad_id', 'tipo_documento', 'actualizado_en']),
  ('vinculos_unidad',       array['id', 'copropiedad_id', 'unidad_id', 'persona_id', 'tipo', 'es_titular', 'reside',
                                  'desde', 'hasta', 'creado_por', 'creado_en', 'actualizado_en']),
  ('politicas_tratamiento', array['id', 'copropiedad_id', 'version', 'vigente_desde', 'meses_conservacion',
                                  'creado_por', 'creado_en']),
  ('autorizaciones_datos',  array['id', 'copropiedad_id', 'persona_id', 'politica_id', 'canal', 'otorgada_en',
                                  'finalidades', 'registrada_por', 'registrada_en', 'revocada_en', 'revocacion_canal',
                                  'revocada_por', 'revocacion_registrada_en'])
) as v (t, c);

-- El id de la entrada también puede ser persona_id (tabla personas_datos).
create or replace function app.registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old));
  v_org uuid;
  v_copro uuid;
  v_id text;
  v_datos jsonb;
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
  elsif tg_table_name = 'invitaciones' then
    v_org := (fila ->> 'organizacion_id')::uuid;
    v_copro := (fila ->> 'copropiedad_id')::uuid;
    v_id := fila ->> 'id';
  else
    v_copro := (fila ->> 'copropiedad_id')::uuid;
    v_org := app.org_de_copropiedad(v_copro);
    v_id := coalesce(fila ->> 'id', fila ->> 'persona_id', fila ->> 'usuario_id', fila ->> 'copropiedad_id');
  end if;

  if tg_op = 'UPDATE' then
    v_datos := jsonb_build_object(
      'antes', app.filtrar_bitacora(tg_table_name, to_jsonb(old)),
      'despues', app.filtrar_bitacora(tg_table_name, to_jsonb(new)),
      'cambios', coalesce((
        select jsonb_agg(n.key order by n.key)
        from jsonb_each(to_jsonb(new)) n
        where n.value is distinct from (to_jsonb(old) -> n.key)
      ), '[]'::jsonb)
    );
  else
    v_datos := app.filtrar_bitacora(tg_table_name, fila);
  end if;

  insert into public.bitacora (organizacion_id, copropiedad_id, usuario_id, accion, entidad, entidad_id, datos)
  values (v_org, v_copro, auth.uid(), lower(tg_op), tg_table_name, v_id, v_datos);
  return coalesce(new, old);
end;
$$;

create trigger bitacora_personas after insert or update on public.personas
  for each row execute function app.registrar_bitacora();
create trigger bitacora_personas_datos after insert or update on public.personas_datos
  for each row execute function app.registrar_bitacora();
create trigger bitacora_vinculos after insert or update on public.vinculos_unidad
  for each row execute function app.registrar_bitacora();
create trigger bitacora_politicas after insert on public.politicas_tratamiento
  for each row execute function app.registrar_bitacora();
create trigger bitacora_autorizaciones after insert or update on public.autorizaciones_datos
  for each row execute function app.registrar_bitacora();

-- Supabase pide RLS en toda tabla nueva; app.bitacora_campos solo la leen funciones security definer
-- (dueño de la tabla), así que activarla sin políticas cierra el acceso directo sin afectar la bitácora.
alter table app.bitacora_campos enable row level security;
