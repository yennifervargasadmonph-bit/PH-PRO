-- PH PRO · Sprint 2
-- Roles con permisos por módulo, datos de marca de la copropiedad,
-- unidades con coeficientes e importación de unidades con registro.

-- ---------------------------------------------------------------------------
-- Roles por copropiedad (matriz de la Fase 0, sección 5)
-- ---------------------------------------------------------------------------

alter type public.rol_copropiedad rename value 'asistente' to 'auxiliar';
alter type public.rol_copropiedad add value if not exists 'propietario';
alter type public.rol_copropiedad add value if not exists 'residente';
alter type public.rol_copropiedad add value if not exists 'proveedor';
