-- PH PRO · Seguridad (auditoría del 13/10/2026, corrección MEDIA 6)
-- La bitácora es inmutable: por eso no debe guardar datos personales que luego haya que
-- suprimir (Ley 1581 de 2012, derecho de supresión). Cada tabla declara qué campos se
-- registran tal cual; cualquier otro campo (incluidos los de tablas o columnas nuevas que
-- no se declaren) se guarda como '[dato personal]', y se anota en "cambios" qué campos cambiaron.

create table app.bitacora_campos (
  tabla text not null,
  campo text not null,
  primary key (tabla, campo)
);
comment on table app.bitacora_campos is
  'Campos que la bitácora registra con su valor. Los demás se enmascaran como [dato personal]. '
  'No agregues correos, celulares, teléfonos, documentos, nombres de personas ni texto libre.';
revoke all on app.bitacora_campos from public;

insert into app.bitacora_campos (tabla, campo)
select t, unnest(c) from (values
  ('organizaciones',        array['id', 'nombre', 'nit', 'creado_en', 'creado_por']),
  ('copropiedades',         array['id', 'organizacion_id', 'nombre', 'nit', 'tipo', 'ciudad', 'direccion', 'prefijo', 'activa', 'creado_en']),
  ('miembros_organizacion', array['organizacion_id', 'usuario_id', 'rol', 'creado_en']),
  ('accesos_copropiedad',   array['copropiedad_id', 'usuario_id', 'rol', 'creado_en']),
  -- Enmascarados: representante_legal (nombre de persona), correo, telefono y celular.
  ('marcas_copropiedad',    array['copropiedad_id', 'color_primario', 'color_secundario', 'logo_ruta', 'eslogan',
                                  'nombre_legal', 'actualizado_en', 'actualizado_por']),
  ('unidades',              array['id', 'copropiedad_id', 'torre', 'numero', 'tipo', 'coeficiente', 'area_m2',
                                  'matricula_inmobiliaria', 'activa', 'creado_por', 'creado_en', 'actualizado_en']),
  -- Enmascarado: rechazos (copia filas del archivo importado, puede traer datos personales).
  ('importaciones',         array['id', 'copropiedad_id', 'tipo', 'archivo', 'total', 'nuevas', 'actualizadas',
                                  'sin_cambios', 'rechazadas', 'aprobado_por', 'creado_en']),
  -- Enmascarados: correo y token_hash.
  ('invitaciones',          array['id', 'organizacion_id', 'rol', 'copropiedad_id', 'rol_copropiedad', 'expira_en',
                                  'estado', 'invitado_por', 'creado_en', 'aceptada_por', 'aceptada_en'])
) as v (t, c);

-- Copia de la fila con los campos no declarados enmascarados (los nulos se dejan nulos).
create or replace function app.filtrar_bitacora(p_tabla text, p_fila jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(
    e.key,
    case
      when e.value = 'null'::jsonb then e.value
      when exists (select 1 from app.bitacora_campos b where b.tabla = p_tabla and b.campo = e.key) then e.value
      else to_jsonb('[dato personal]'::text)
    end
  ), '{}'::jsonb)
  from jsonb_each(p_fila) e;
$$;
revoke all on function app.filtrar_bitacora(text, jsonb) from public;

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
    v_id := coalesce(fila ->> 'id', fila ->> 'usuario_id', fila ->> 'copropiedad_id');
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

create trigger bitacora_invitaciones after insert or update on public.invitaciones
  for each row execute function app.registrar_bitacora();
