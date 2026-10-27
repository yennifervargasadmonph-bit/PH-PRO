-- PH PRO · Seguridad (auditoría del 27/10/2026)
-- Nadie entra al equipo ni recibe acceso a una copropiedad sin aceptar una invitación.
-- Las políticas de UPDATE dejaban que la administración cambiara usuario_id u
-- organizacion_id/copropiedad_id de una fila existente: eso agregaba a cualquier persona
-- (por su id) sin invitación, o pasaba a alguien a otra organización. Ahora una membresía
-- y un acceso solo cambian de rol; para cambiar de persona u organización se quita la fila
-- y se invita de nuevo.

create or replace function app.membresia_inmutable()
returns trigger language plpgsql as $$
begin
  if new.usuario_id is distinct from old.usuario_id then
    raise exception 'Una membresía no puede cambiar de persona: quítala e invita a la persona' using errcode = '42501';
  end if;
  -- Cada tabla en su propio bloque: plpgsql no garantiza el corto circuito de "and".
  if tg_table_name = 'miembros_organizacion' then
    if new.organizacion_id is distinct from old.organizacion_id then
      raise exception 'Una membresía no puede cambiar de organización' using errcode = '42501';
    end if;
  else
    if new.copropiedad_id is distinct from old.copropiedad_id then
      raise exception 'Un acceso no puede cambiar de copropiedad' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger miembros_inmutables before update on public.miembros_organizacion
  for each row execute function app.membresia_inmutable();
create trigger accesos_inmutables before update on public.accesos_copropiedad
  for each row execute function app.membresia_inmutable();

