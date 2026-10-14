-- PH PRO · Seguridad (auditoría del 13/10/2026, corrección MEDIA 5)
-- Los logos solo pueden ser PNG, JPG o WEBP. Un SVG puede llevar código activo y una
-- lista de patrones prohibidos no es suficiente para detenerlo.

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'marcas';

-- Solo las rutas <uuid>/logo.<png|jpg|webp> pertenecen a una copropiedad. Un logo.svg
-- cargado antes deja de ser visible para todos (las políticas de storage.objects usan esta función).
create or replace function app.copropiedad_de_logo(p_nombre text)
returns uuid language sql immutable set search_path = pg_catalog as $$
  select case
    when p_nombre ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo\.(png|jpg|webp)$'
    then split_part(p_nombre, '/', 1)::uuid
  end;
$$;

-- La identidad deja de apuntar a un logo SVG (aparecerá como «Dato faltante» hasta cargar otro).
update public.marcas_copropiedad set logo_ruta = null where logo_ruta ~ '\.svg$';
alter table public.marcas_copropiedad drop constraint marcas_logo_ruta_propia;
alter table public.marcas_copropiedad
  add constraint marcas_logo_ruta_propia
  check (logo_ruta is null or logo_ruta ~ ('^' || copropiedad_id::text || '/logo\.(png|jpg|webp)$'));
