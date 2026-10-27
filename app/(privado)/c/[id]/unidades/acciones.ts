'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { usuarioActual } from '@/lib/datos'
import { esquemaUnidad } from '@/lib/unidades'
import { datosFormulario } from '@/lib/validacion'

export type Estado = { error?: string; ok?: string }

const SIN_PERMISO = 'No tienes permiso para hacer este cambio.'
const esUuid = (v: unknown): v is string => z.uuid().safeParse(v).success

export async function guardarUnidad(copropiedadId: string, unidadId: string | null, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copropiedadId) || (unidadId !== null && !esUuid(unidadId))) return { error: SIN_PERMISO }
  const datos = esquemaUnidad.safeParse(datosFormulario(f))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const { supabase } = await usuarioActual()
  const consulta = unidadId
    ? supabase.from('unidades').update(datos.data).eq('id', unidadId).eq('copropiedad_id', copropiedadId).select('id')
    : supabase.from('unidades').insert({ ...datos.data, copropiedad_id: copropiedadId }).select('id')
  const { data, error } = await consulta
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe una unidad con esa torre y ese número.' }
    if (error.code === '42501') return { error: 'No tienes permiso para hacer este cambio.' }
    return { error: 'No pudimos guardar la unidad. Revisa los datos.' }
  }
  if (!data?.length) return { error: 'No tienes permiso para hacer este cambio.' }
  revalidatePath(`/c/${copropiedadId}`, 'layout')
  return { ok: unidadId ? 'Cambios guardados.' : `Unidad ${datos.data.numero} creada.` }
}

export async function cambiarEstadoUnidad(copropiedadId: string, unidadId: string, activa: boolean) {
  if (!esUuid(copropiedadId) || !esUuid(unidadId) || typeof activa !== 'boolean') return
  const { supabase } = await usuarioActual()
  await supabase.from('unidades').update({ activa }).eq('id', unidadId).eq('copropiedad_id', copropiedadId)
  revalidatePath(`/c/${copropiedadId}`, 'layout')
}
