-- PH PRO · Seguridad (auditoría del 13/10/2026, corrección ALTA 1)
-- La verificación en dos pasos se exige en la base de datos, no solo en la aplicación.
--
-- Regla (guía de MFA de Supabase, ampliada):
--   * Quien tiene un factor verificado (auth.mfa_factors.status = 'verified') debe
--     presentar una sesión aal2 para leer o escribir cualquier dato.
--   * Para los roles sensibles la verificación es obligatoria aunque no haya
--     activado ningún factor: administradora, auxiliar, contador y revisor_fiscal
--     en cualquier copropiedad, y propietario o administrador de una organización
--     (tienen todos los permisos de la administradora en todas sus copropiedades).
--   * Las demás personas (consejo, portería, residentes…) sin factor no se ven afectadas.
--
-- Se aplica con una política RESTRICTIVA en cada tabla del esquema public y en
-- storage.objects, y con app.exigir_mfa() dentro de cada función security definer
-- (esas funciones no pasan por RLS). tests/db/mfa.test.ts verifica las tres cosas.

-- ¿La persona debe usar verificación en dos pasos por su rol?
create or replace function app.mfa_obligatoria_por_rol(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.accesos_copropiedad a
    where a.usuario_id = p_usuario
      and a.rol in ('administradora', 'auxiliar', 'contador', 'revisor_fiscal')
  ) or exists (
    select 1 from public.miembros_organizacion m
    where m.usuario_id = p_usuario and m.rol in ('propietario', 'administrador')
  );
$$;

-- ¿La sesión actual cumple el nivel de verificación que le corresponde?
create or replace function app.mfa_cumplida()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or auth.uid() is null
    or not (
      exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
      or app.mfa_obligatoria_por_rol(auth.uid())
    );
$$;

-- Para las funciones security definer: detiene la operación si falta el segundo paso.
create or replace function app.exigir_mfa()
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.mfa_cumplida() then
    raise exception 'Debes completar la verificación en dos pasos para continuar' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.mfa_obligatoria_por_rol(uuid), app.mfa_cumplida(), app.exigir_mfa() from public;
grant execute on function app.mfa_cumplida(), app.exigir_mfa() to authenticated;

-- Para la aplicación: si la persona debe activar la verificación antes de entrar.
-- Solo informa sobre la propia sesión.
create or replace function public.mfa_pendiente()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
    and app.mfa_obligatoria_por_rol(auth.uid());
$$;
revoke all on function public.mfa_pendiente() from public, anon;
grant execute on function public.mfa_pendiente() to authenticated;

-- ---------------------------------------------------------------------------
-- Política restrictiva en todas las tablas existentes del esquema public.
-- Las tablas nuevas deben agregarla (lo exige tests/db/mfa.test.ts).
-- "(select …)" hace que se evalúe una vez por consulta y no por fila.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format(
      'create policy exigir_mfa on public.%I as restrictive for all to authenticated
         using ((select app.mfa_cumplida())) with check ((select app.mfa_cumplida()))', t);
  end loop;
end $$;

create policy exigir_mfa on storage.objects as restrictive for all to authenticated
  using ((select app.mfa_cumplida())) with check ((select app.mfa_cumplida()));

-- ---------------------------------------------------------------------------
-- Funciones security definer existentes: ahora también exigen el segundo paso.
-- (Mismo cuerpo que antes más app.exigir_mfa().)
-- ---------------------------------------------------------------------------

create or replace function public.crear_organizacion(p_nombre text, p_nit text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión iniciada' using errcode = '42501';
  end if;
  perform app.exigir_mfa();
  insert into public.organizaciones (nombre, nit, creado_por)
  values (trim(p_nombre), nullif(trim(p_nit), ''), auth.uid())
  returning id into v_id;
  insert into public.miembros_organizacion (organizacion_id, usuario_id, rol)
  values (v_id, auth.uid(), 'propietario');
  return v_id;
end;
$$;

create or replace function public.mis_permisos(p_copro uuid)
returns table (modulo text, acciones text[]) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.exigir_mfa();
  return query
  select m.modulo, m.acciones from (
    select p.modulo, p.acciones from public.permisos_rol p
    join public.accesos_copropiedad a on a.rol = p.rol
    where a.copropiedad_id = p_copro and a.usuario_id = auth.uid()
      and not app.es_admin_org(app.org_de_copropiedad(p_copro))
    union all
    select distinct p.modulo, array['V','C','E','A','I','X','P'] from public.permisos_rol p
    where app.es_admin_org(app.org_de_copropiedad(p_copro))
  ) m;
end;
$$;

create or replace function public.agregar_miembro(p_org uuid, p_correo text, p_rol public.rol_organizacion default 'miembro')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_usuario uuid;
begin
  perform app.exigir_mfa();
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

create or replace function public.guardar_identidad(
  p_copro uuid,
  p_nombre_legal text,
  p_nit text,
  p_celular text,
  p_representante_legal text default null,
  p_correo text default null,
  p_telefono text default null,
  p_eslogan text default null,
  p_color_primario text default null,
  p_color_secundario text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nit text := nullif(btrim(coalesce(p_nit, '')), '');
begin
  perform app.exigir_mfa();
  if p_copro is null or not app.puede(p_copro, 'perfil', 'E') then
    raise exception 'Solo la administración puede cambiar la identidad de la copropiedad' using errcode = '42501';
  end if;

  update public.copropiedades set nit = v_nit
  where id = p_copro and nit is distinct from v_nit;

  update public.marcas_copropiedad set
    nombre_legal = p_nombre_legal,
    celular = p_celular,
    representante_legal = coalesce(btrim(p_representante_legal), representante_legal),
    correo = coalesce(btrim(p_correo), correo),
    telefono = coalesce(btrim(p_telefono), telefono),
    eslogan = coalesce(btrim(p_eslogan), eslogan),
    color_primario = coalesce(p_color_primario, color_primario),
    color_secundario = coalesce(p_color_secundario, color_secundario)
  where copropiedad_id = p_copro;
end;
$$;

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
  perform app.exigir_mfa();
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
