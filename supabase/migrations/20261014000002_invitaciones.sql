-- PH PRO · Seguridad (auditoría del 13/10/2026, corrección ALTA 2)
-- El correo del perfil ya no lo edita la persona: se copia de auth.users.
-- Las personas entran al equipo solo por invitación, que la persona acepta con su
-- sesión iniciada y con el mismo correo al que se le envió. Invitar nunca revela
-- si un correo tiene cuenta.

-- ---------------------------------------------------------------------------
-- Perfiles: solo el nombre es editable; el correo viene del proveedor de autenticación
-- ---------------------------------------------------------------------------

revoke update on public.perfiles from authenticated;
grant update (nombre) on public.perfiles to authenticated;

-- Corrige cualquier correo que se haya cambiado a mano antes de esta migración.
update public.perfiles p set correo = coalesce(u.email, '')
from auth.users u
where u.id = p.id and p.correo is distinct from coalesce(u.email, '');

create or replace function app.sincronizar_correo_perfil()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.perfiles set correo = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;
create trigger al_cambiar_correo_usuario after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.sincronizar_correo_perfil();

-- Agregar por correo (buscando en perfiles) queda eliminado: se reemplaza por invitaciones.
drop function public.agregar_miembro(uuid, text, public.rol_organizacion);

-- Tampoco se insertan miembros directamente: solo al aceptar una invitación
-- (o al crear la organización, como propietario).
drop policy miembros_crear on public.miembros_organizacion;
revoke insert on public.miembros_organizacion from authenticated;

-- ---------------------------------------------------------------------------
-- Invitaciones
-- ---------------------------------------------------------------------------

create type public.estado_invitacion as enum ('pendiente', 'aceptada', 'revocada');

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  correo text not null check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and correo = lower(correo)),
  rol public.rol_organizacion not null default 'miembro' check (rol <> 'propietario'),
  -- Acceso opcional a una copropiedad con un rol, que se da al aceptar.
  copropiedad_id uuid references public.copropiedades (id) on delete cascade,
  rol_copropiedad public.rol_copropiedad,
  -- Solo se guarda el SHA-256 del token; el enlace con el token se muestra una sola vez.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expira_en timestamptz not null,
  estado public.estado_invitacion not null default 'pendiente',
  invitado_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  aceptada_por uuid references auth.users (id),
  aceptada_en timestamptz,
  check ((copropiedad_id is null) = (rol_copropiedad is null))
);
create index on public.invitaciones (organizacion_id, creado_en desc);
create unique index invitaciones_una_pendiente on public.invitaciones (organizacion_id, correo) where estado = 'pendiente';

alter table public.invitaciones enable row level security;
create policy exigir_mfa on public.invitaciones as restrictive for all to authenticated
  using ((select app.mfa_cumplida())) with check ((select app.mfa_cumplida()));
-- La administración de la organización ve sus invitaciones (sin el hash del token).
create policy invitaciones_ver on public.invitaciones for select to authenticated
  using (app.es_admin_org(organizacion_id));
grant select (id, organizacion_id, correo, rol, copropiedad_id, rol_copropiedad, expira_en, estado,
              invitado_por, creado_en, aceptada_por, aceptada_en)
  on public.invitaciones to authenticated;
-- Se crean, revocan y aceptan solo con las funciones de abajo.

create or replace function app.hash_token(p_token text)
returns text language sql immutable strict set search_path = pg_catalog as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- Crea la invitación y devuelve el token (para armar el enlace). No consulta si el correo
-- tiene cuenta, así que la respuesta es la misma exista o no. Si ya había una invitación
-- pendiente para ese correo en la organización, la reemplaza.
create or replace function public.invitar_persona(
  p_org uuid,
  p_correo text,
  p_rol public.rol_organizacion default 'miembro',
  p_copro uuid default null,
  p_rol_copro public.rol_copropiedad default null
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_token text;
begin
  perform app.exigir_mfa();
  if p_org is null or not app.es_admin_org(p_org) then
    raise exception 'Solo la administración puede invitar personas al equipo' using errcode = '42501';
  end if;
  if p_rol = 'propietario' then
    raise exception 'No se puede invitar a alguien como propietario de la organización' using errcode = '42501';
  end if;
  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Escribe un correo válido' using errcode = '22023';
  end if;
  if (p_copro is null) <> (p_rol_copro is null) then
    raise exception 'Para dar acceso a una copropiedad elige la copropiedad y el rol' using errcode = '22023';
  end if;
  if p_copro is not null and app.org_de_copropiedad(p_copro) is distinct from p_org then
    raise exception 'La copropiedad no pertenece a la organización' using errcode = '42501';
  end if;

  update public.invitaciones set estado = 'revocada'
  where organizacion_id = p_org and correo = v_correo and estado = 'pendiente';

  -- 244 bits aleatorios (dos UUID v4) en hexadecimal.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitaciones (organizacion_id, correo, rol, copropiedad_id, rol_copropiedad, token_hash, expira_en, invitado_por)
  values (p_org, v_correo, p_rol, p_copro, p_rol_copro, app.hash_token(v_token), now() + interval '7 days', auth.uid());
  return v_token;
end;
$$;

create or replace function public.revocar_invitacion(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.exigir_mfa();
  update public.invitaciones set estado = 'revocada'
  where id = p_id and estado = 'pendiente' and app.es_admin_org(organizacion_id);
  if not found then
    raise exception 'No hay una invitación pendiente que puedas revocar' using errcode = '42501';
  end if;
end;
$$;

-- Invitación vigente para la sesión actual: el token coincide, no está vencida ni usada,
-- y el correo confirmado de la cuenta es el invitado (sin distinguir mayúsculas).
create or replace function app.invitacion_para_mi(p_token text)
returns public.invitaciones language sql stable security definer set search_path = public, pg_temp as $$
  select i.* from public.invitaciones i
  join auth.users u on u.id = auth.uid()
  where i.token_hash = app.hash_token(coalesce(p_token, ''))
    and i.estado = 'pendiente'
    and i.expira_en > now()
    and u.email_confirmed_at is not null
    and lower(u.email) = i.correo;
$$;
revoke all on function app.invitacion_para_mi(text) from public;

-- Lo que la persona invitada necesita ver antes de aceptar. Vacío si no le corresponde.
create or replace function public.consultar_invitacion(p_token text)
returns table (organizacion text, rol public.rol_organizacion, copropiedad text, rol_copropiedad public.rol_copropiedad, expira_en timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.exigir_mfa();
  return query
  select o.nombre, i.rol, c.nombre, i.rol_copropiedad, i.expira_en
  from app.invitacion_para_mi(p_token) i
  join public.organizaciones o on o.id = i.organizacion_id
  left join public.copropiedades c on c.id = i.copropiedad_id
  where i.id is not null;
end;
$$;

create or replace function public.aceptar_invitacion(p_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v public.invitaciones;
begin
  perform app.exigir_mfa();
  if auth.uid() is null then
    raise exception 'Se requiere una sesión iniciada' using errcode = '42501';
  end if;
  select i.id into v_id from app.invitacion_para_mi(p_token) i;
  -- Se bloquea la fila para que dos aceptaciones simultáneas no la usen dos veces.
  select * into v from public.invitaciones where id = v_id and estado = 'pendiente' for update;
  if not found then
    -- Un solo mensaje para token falso, vencido, usado, revocado o de otro correo.
    raise exception 'La invitación no es válida, ya se usó, venció o es para otro correo' using errcode = 'P0002';
  end if;

  insert into public.miembros_organizacion (organizacion_id, usuario_id, rol)
  values (v.organizacion_id, auth.uid(), v.rol)
  on conflict (organizacion_id, usuario_id) do nothing;
  if v.copropiedad_id is not null then
    insert into public.accesos_copropiedad (copropiedad_id, usuario_id, rol)
    values (v.copropiedad_id, auth.uid(), v.rol_copropiedad)
    on conflict (copropiedad_id, usuario_id) do update set rol = excluded.rol;
  end if;
  update public.invitaciones set estado = 'aceptada', aceptada_por = auth.uid(), aceptada_en = now()
  where id = v.id;
  return v.organizacion_id;
end;
$$;

revoke all on function public.invitar_persona(uuid, text, public.rol_organizacion, uuid, public.rol_copropiedad),
  public.revocar_invitacion(uuid), public.consultar_invitacion(text), public.aceptar_invitacion(text) from public, anon;
grant execute on function public.invitar_persona(uuid, text, public.rol_organizacion, uuid, public.rol_copropiedad),
  public.revocar_invitacion(uuid), public.consultar_invitacion(text), public.aceptar_invitacion(text) to authenticated;
