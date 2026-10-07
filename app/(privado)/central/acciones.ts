'use server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/datos'
import { COOKIE_COPROPIEDAD } from '@/lib/sesion'
import { datosFormulario, esquemaCopropiedad, esquemaOrganizacion } from '@/lib/validacion'

export type Estado = { error?: string; ok?: string }

export async function crearOrganizacion(_: Estado, f: FormData): Promise<Estado> {
  const datos = esquemaOrganizacion.safeParse(datosFormulario(f))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const { supabase } = await usuarioActual()
  const { error } = await supabase.rpc('crear_organizacion', { p_nombre: datos.data.nombre, p_nit: datos.data.nit })
  if (error) return { error: 'No pudimos crear la organización. Inténtalo de nuevo.' }
  revalidatePath('/central')
  return { ok: 'Organización creada.' }
}

export async function crearCopropiedad(_: Estado, f: FormData): Promise<Estado> {
  const crudo = datosFormulario(f)
  const datos = esquemaCopropiedad.safeParse(crudo)
  if (!datos.success) return { error: datos.error.issues[0].message }
  const { supabase } = await usuarioActual()
  const { error } = await supabase.from('copropiedades').insert({ ...datos.data, organizacion_id: crudo.organizacion_id })
  if (error) {
    if (error.code === '23505') return { error: `Ya existe una copropiedad con el prefijo ${datos.data.prefijo}.` }
    if (error.code === '42501') return { error: 'No tienes permiso para crear copropiedades en esta organización.' }
    return { error: 'No pudimos crear la copropiedad. Revisa los datos e inténtalo de nuevo.' }
  }
  revalidatePath('/central')
  return { ok: `${datos.data.nombre} quedó creada.` }
}

/** Fija la copropiedad activa: todo lo que se haga después ocurre solo en ella. */
export async function entrarCopropiedad(id: string) {
  const { supabase } = await usuarioActual()
  const { data } = await supabase.from('copropiedades').select('id').eq('id', id).maybeSingle()
  if (!data) redirect('/central')
  const almacen = await cookies()
  almacen.set(COOKIE_COPROPIEDAD, data.id, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  redirect(`/c/${data.id}`)
}
