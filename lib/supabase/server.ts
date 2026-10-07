import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { configSupabase } from './config'

/** Cliente de Supabase para componentes de servidor, acciones y rutas. Uno por solicitud. */
export async function crearClienteServidor() {
  const almacen = await cookies()
  const { url, key } = configSupabase()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll(porGuardar) {
        try {
          porGuardar.forEach(({ name, value, options }) => almacen.set(name, value, options))
        } catch {
          // En componentes de servidor no se pueden escribir cookies; el proxy renueva la sesión.
        }
      },
    },
  })
}
