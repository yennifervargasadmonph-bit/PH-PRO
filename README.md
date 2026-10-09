# PH PRO

Administración de propiedad horizontal en Colombia (Ley 675 de 2001).
Regla de la casa: **la IA propone, la administración decide**.

## Qué hay en este momento (Sprints 1 y 2)

- Ingreso con correo y contraseña, recuperación por correo y verificación en dos pasos con aplicación autenticadora.
- Cierre de sesión tras 30 minutos sin actividad.
- Organizaciones administradoras y copropiedades (PH PRO Central), con el aviso
  "Trabajando actualmente en: NOMBRE DE LA COPROPIEDAD" al entrar a una de ellas.
- Aislamiento por fila (RLS) en PostgreSQL: cada persona solo ve las organizaciones y copropiedades a las que pertenece.
- Bitácora inmutable de cambios.
- Pruebas automáticas de fuga entre organizaciones y copropiedades en cada cambio (`tests/db`).
- Roles por copropiedad (administradora, auxiliar, contador, revisor fiscal, consejo, portería) con permisos por módulo según la matriz de la Fase 0.
- Equipo: agregar personas con cuenta y asignarles copropiedades y roles.
- Unidades con coeficientes, control de que sumen 100 %, edición e inactivación (nada se borra).
- Importación de unidades desde Excel (.xlsx) o CSV: mapeo de columnas, validación, vista previa
  (nuevas, actualizadas, sin cambios y rechazadas), aprobación de la administración y registro de cada importación.
- Identidad del edificio: logo, nombre completo, NIT (con dígito de verificación DIAN) y celular de la
  administración, más colores, representante legal y contacto. Todos los documentos usan esa identidad
  (`components/membrete.tsx`: `<Membrete/>` y `<PieInstitucional/>`; lo que falte sale como «Dato faltante»).
  Los logos van al bucket privado `marcas` de Supabase Storage (`<copropiedad_id>/logo.<ext>`, máx. 2 MB).

## Tecnología

- Next.js 16 con React y TypeScript.
- Supabase: PostgreSQL con RLS y autenticación gestionada.
- Vitest para pruebas; GitHub Actions corre estilo, tipos, pruebas y compilación.

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com) (región São Paulo, la más cercana a Colombia).
2. En el editor SQL del proyecto, ejecuta los archivos de `supabase/migrations/` en orden
   (o usa `supabase db push` con la CLI de Supabase).
3. En Authentication:
   - URL Configuration: agrega `https://TU-DOMINIO/auth/confirmar` a las URL de redirección.
   - Desactiva el registro abierto (Sign ups). Las cuentas se crean desde Authentication > Users > Invite user.
   - Activa MFA con TOTP.
4. Copia `.env.example` como `.env.local` y completa la URL y la llave publicable del proyecto.
5. `npm install` y `npm run dev`. La aplicación queda en http://localhost:3000.

La primera persona que ingresa crea su organización; quien la crea queda como propietaria.

## Pruebas

```bash
npm test          # pruebas unitarias
npm run test:db   # aislamiento entre copropiedades; necesita PostgreSQL 16 en DATABASE_URL
```

`tests/db` aplica las migraciones sobre una base nueva con un pequeño emulador de los esquemas `auth`
y `storage` de Supabase (`tests/db/supabase-shim.sql`) y comprueba, como usuarios reales, que nadie puede leer
ni escribir datos de otra organización o de una copropiedad que no tiene asignada.
También falla si alguien crea una tabla sin RLS.

## Reglas para nuevas tablas

- Toda tabla con datos de una copropiedad lleva `copropiedad_id`, RLS activo y políticas que usen
  `app.puede_ver_copropiedad()` o `app.es_admin_org()`.
- Agrega sus casos a `tests/db/aislamiento.test.ts` antes de construir pantallas.
