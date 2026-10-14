-- PH PRO · Identidad propia de cada copropiedad
-- Cada edificio tiene su identidad (logo, nombre completo, NIT y celular de la
-- administración) y todos los documentos se preparan bajo esa identidad.
--
-- Dónde vive cada dato:
--   copropiedades.nit                       (ya existía; ahora con dígito de verificación DIAN)
--   marcas_copropiedad.nombre_legal         (nombre completo, tal como figura en la certificación)
--   marcas_copropiedad.celular              (celular de la administración, 10 dígitos)
--   marcas_copropiedad.logo_ruta            (ruta en el bucket privado "marcas": <copropiedad_id>/logo.<ext>)
-- Los cambios quedan en la bitácora por los triggers existentes sobre
-- copropiedades y marcas_copropiedad (quién, cuándo, antes y después).

-- ---------------------------------------------------------------------------
-- NIT con dígito de verificación (DIAN, módulo 11)
-- ---------------------------------------------------------------------------

-- Pesos 3, 7, 13, … 71 aplicados de derecha a izquierda; dv = r si r < 2, si no 11 - r.
create or replace function app.nit_dv_valido(p_nit text)
returns boolean language plpgsql immutable strict set search_path = pg_catalog as $$
declare
  m text[];
  numero text;
  pesos integer[] := array[3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  suma integer := 0;
  r integer;
begin
  m := regexp_match(p_nit, '^([0-9]{1,15})-([0-9])$');
  if m is null then
    return false;
  end if;
  numero := m[1];
  for i in 1 .. length(numero) loop
    suma := suma + substr(numero, length(numero) - i + 1, 1)::integer * pesos[i];
  end loop;
  r := suma % 11;
  return (case when r < 2 then r else 11 - r end) = m[2]::integer;
end;
$$;
grant execute on function app.nit_dv_valido(text) to authenticated;

-- La interfaz siempre validó el dígito; por si hubiera datos viejos sin validar,
-- la regla se crea sin revisar el pasado y luego se intenta validar.
alter table public.copropiedades
  add constraint copropiedades_nit_dv check (nit is null or app.nit_dv_valido(nit)) not valid;
alter table public.organizaciones
  add constraint organizaciones_nit_dv check (nit is null or app.nit_dv_valido(nit)) not valid;

do $$
begin
  alter table public.copropiedades validate constraint copropiedades_nit_dv;
exception when check_violation then
  raise notice 'Hay copropiedades con un NIT cuyo dígito de verificación no corresponde; se exigirá al editarlas.';
end $$;
do $$
begin
  alter table public.organizaciones validate constraint organizaciones_nit_dv;
exception when check_violation then
  raise notice 'Hay organizaciones con un NIT cuyo dígito de verificación no corresponde; se exigirá al editarlas.';
end $$;

-- ---------------------------------------------------------------------------
-- Nombre completo y celular (en los datos de identidad/marca de la copropiedad)
-- ---------------------------------------------------------------------------

alter table public.marcas_copropiedad
  add column nombre_legal text
    constraint marcas_nombre_legal_largo check (nombre_legal is null or char_length(nombre_legal) between 5 and 160),
  add column celular text
    constraint marcas_celular_formato check (celular is null or celular ~ '^3[0-9]{9}$');

-- El logo solo puede apuntar a la carpeta de su propia copropiedad.
-- No había forma de cargar logos antes de esta migración: cualquier valor previo se descarta.
update public.marcas_copropiedad set logo_ruta = null
where logo_ruta is not null and logo_ruta !~ ('^' || copropiedad_id::text || '/logo\.(png|jpg|webp|svg)$');
alter table public.marcas_copropiedad
  add constraint marcas_logo_ruta_propia
  check (logo_ruta is null or logo_ruta ~ ('^' || copropiedad_id::text || '/logo\.(png|jpg|webp|svg)$'));

grant update (nombre_legal, celular) on public.marcas_copropiedad to authenticated;

-- Normaliza lo que se guarda y deja constancia de quién lo cambió.
-- Celular: se aceptan espacios, guiones, paréntesis y el indicativo +57; se guardan 10 dígitos
-- (cualquier otro carácter se conserva para que la regla de formato lo rechace).
create or replace function app.marca_antes_de_guardar()
returns trigger language plpgsql as $$
declare
  v_cel text;
begin
  new.nombre_legal := nullif(regexp_replace(btrim(coalesce(new.nombre_legal, '')), '\s+', ' ', 'g'), '');
  v_cel := regexp_replace(coalesce(new.celular, ''), '[[:space:]().+-]', '', 'g');
  if length(v_cel) = 12 and left(v_cel, 2) = '57' then
    v_cel := substr(v_cel, 3);
  end if;
  new.celular := nullif(v_cel, '');
  if tg_op = 'UPDATE' then
    new.copropiedad_id := old.copropiedad_id;
    new.actualizado_en := now();
    new.actualizado_por := auth.uid();
  end if;
  return new;
end;
$$;
create trigger marcas_normalizar before insert or update on public.marcas_copropiedad
  for each row execute function app.marca_antes_de_guardar();

-- ---------------------------------------------------------------------------
-- Guardar la identidad: la administración de la copropiedad (perfil E)
-- cambia nombre completo, NIT, celular y los demás datos en una sola operación.
-- El NIT vive en copropiedades, que por RLS solo editan los administradores de la
-- organización; esta función permite que también lo haga quien tiene el rol
-- "administradora" en la copropiedad, y solo eso.
-- ---------------------------------------------------------------------------

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
revoke all on function public.guardar_identidad(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.guardar_identidad(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Logos: bucket privado "marcas", una carpeta por copropiedad
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcas', 'marcas', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Copropiedad dueña de un archivo del bucket, solo si la ruta es exactamente
-- <uuid>/logo.<png|jpg|webp|svg>. Cualquier otra ruta no pertenece a nadie.
create or replace function app.copropiedad_de_logo(p_nombre text)
returns uuid language sql immutable set search_path = pg_catalog as $$
  select case
    when p_nombre ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo\.(png|jpg|webp|svg)$'
    then split_part(p_nombre, '/', 1)::uuid
  end;
$$;
grant execute on function app.copropiedad_de_logo(text) to authenticated;

create policy marcas_logo_ver on storage.objects for select to authenticated
  using (bucket_id = 'marcas' and app.puede(app.copropiedad_de_logo(name), 'perfil', 'V'));
create policy marcas_logo_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'marcas' and app.puede(app.copropiedad_de_logo(name), 'perfil', 'E'));
create policy marcas_logo_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'marcas' and app.puede(app.copropiedad_de_logo(name), 'perfil', 'E'))
  with check (bucket_id = 'marcas' and app.puede(app.copropiedad_de_logo(name), 'perfil', 'E'));
create policy marcas_logo_quitar on storage.objects for delete to authenticated
  using (bucket_id = 'marcas' and app.puede(app.copropiedad_de_logo(name), 'perfil', 'E'));
