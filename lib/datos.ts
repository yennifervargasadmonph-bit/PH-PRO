import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'

export type Organizacion = { id: string; nombre: string; nit: string | null; rol: 'propietario' | 'administrador' | 'miembro' }
export type Copropiedad = {
  id: string
  organizacion_id: string
  nombre: string
  nit: string | null
  tipo: string
  ciudad: string
  direccion: string
  prefijo: string
  activa: boolean
}

/** Usuario con sesión o redirección al ingreso. Se memoriza por solicitud. */
export const usuarioActual = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/ingresar')
  return { supabase, usuario: data.user }
})

/** Organizaciones de las que la persona es miembro, con su rol. */
export const misOrganizaciones = cache(async (): Promise<Organizacion[]> => {
  const { supabase, usuario } = await usuarioActual()
  const { data, error } = await supabase
    .from('miembros_organizacion')
    .select('rol, organizaciones (id, nombre, nit)')
    .eq('usuario_id', usuario.id)
  if (error) throw error
  return (data ?? []).flatMap((m) => {
    const o = m.organizaciones as unknown as { id: string; nombre: string; nit: string | null } | null
    return o ? [{ ...o, rol: m.rol as Organizacion['rol'] }] : []
  })
})

export const esAdministrador = (o: Organizacion) => o.rol === 'propietario' || o.rol === 'administrador'

export type Permisos = Record<string, string[]>

/** Copropiedad visible para la persona (RLS) o null. */
export const leerCopropiedad = cache(async (id: string): Promise<Copropiedad | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { supabase } = await usuarioActual()
  const { data } = await supabase.from('copropiedades').select('*').eq('id', id).maybeSingle()
  return (data as Copropiedad | null) ?? null
})

/** Permisos de la persona en la copropiedad, por módulo. */
export const misPermisos = cache(async (copropiedadId: string): Promise<Permisos> => {
  const { supabase } = await usuarioActual()
  const { data } = await supabase.rpc('mis_permisos', { p_copro: copropiedadId })
  const permisos: Permisos = {}
  for (const p of (data ?? []) as { modulo: string; acciones: string[] }[]) {
    permisos[p.modulo] = [...new Set([...(permisos[p.modulo] ?? []), ...p.acciones])]
  }
  return permisos
})

export const puede = (permisos: Permisos, modulo: string, accion: string) => permisos[modulo]?.includes(accion) ?? false
