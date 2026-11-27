'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { usuarioActual } from '@/lib/datos'
import { esquemaAutorizacion, esquemaPersona, esquemaPolitica, esquemaRevocacion, esquemaVinculo } from '@/lib/personas'
import { datosFormulario } from '@/lib/validacion'

export type Estado = { error?: string; ok?: string }

const SIN_PERMISO = 'No tienes permiso para hacer este cambio.'
const esUuid = (v: unknown): v is string => z.uuid().safeParse(v).success
const refrescar = (copro: string) => revalidatePath(`/c/${copro}`, 'layout')

/** Ruta de regreso: solo rutas de esta copropiedad. */
function regreso(copro: string, f: FormData, porDefecto: string) {
  const r = String(f.get('regreso') ?? '')
  return r.startsWith(`/c/${copro}/`) && !r.includes('//') && !/[\\\u0000-\u001f]/.test(r) ? r : porDefecto
}

function mensajeError(codigo: string | undefined, duplicado: string) {
  if (codigo === '23505') return duplicado
  if (codigo === '42501') return SIN_PERMISO
  return 'No pudimos guardar el cambio. Revisa los datos e inténtalo de nuevo.'
}

export async function registrarPersona(copro: string, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copro)) return { error: SIN_PERMISO }
  const datos = esquemaPersona.safeParse(datosFormulario(f))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const d = datos.data
  const { supabase } = await usuarioActual()
  const { data: id, error } = await supabase.rpc('registrar_persona', {
    p_copro: copro,
    p_nombre: d.nombre,
    p_tipo_persona: d.tipo_persona,
    p_tipo_documento: d.tipo_documento,
    p_numero_documento: d.numero_documento,
    p_correo: d.correo,
    p_celular: d.celular,
    p_telefono: d.telefono,
  })
  if (error || typeof id !== 'string') return { error: mensajeError(error?.code, 'Ya existe una persona con ese documento. Búscala en la lista y vincúlala.') }
  refrescar(copro)
  const base = regreso(copro, f, `/c/${copro}/personas`)
  redirect(`${base}${base.includes('?') ? '&' : '?'}p=${id}`)
}

export async function editarPersona(copro: string, personaId: string, verDatos: boolean, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copro) || !esUuid(personaId)) return { error: SIN_PERMISO }
  const datos = esquemaPersona.safeParse(datosFormulario(f))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const { nombre, tipo_persona, ...contacto } = datos.data
  const { supabase } = await usuarioActual()
  const { data, error } = await supabase.from('personas').update({ nombre, tipo_persona }).eq('id', personaId).eq('copropiedad_id', copro).select('id')
  if (error || !data?.length) return { error: mensajeError(error?.code, '') }
  if (verDatos) {
    const { error: e2 } = await supabase
      .from('personas_datos')
      .upsert({ persona_id: personaId, copropiedad_id: copro, ...contacto }, { onConflict: 'persona_id' })
    if (e2) return { error: mensajeError(e2.code, 'Ya existe otra persona con ese documento.') }
  }
  refrescar(copro)
  return { ok: 'Cambios guardados.' }
}

export async function cambiarEstadoPersona(copro: string, personaId: string, activa: boolean) {
  if (!esUuid(copro) || !esUuid(personaId) || typeof activa !== 'boolean') return
  const { supabase } = await usuarioActual()
  await supabase.from('personas').update({ activa }).eq('id', personaId).eq('copropiedad_id', copro)
  refrescar(copro)
}

/**
 * Vincula una persona a una unidad. La persona puede ser una ya registrada (persona_id) o una
 * nueva (nombre y datos), que se registra primero: así nadie se registra dos veces.
 */
export async function vincular(copro: string, unidadFija: string | null, personaFija: string | null, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copro)) return { error: SIN_PERMISO }
  const unidad = unidadFija ?? String(f.get('unidad_id') ?? '')
  if (!esUuid(unidad)) return { error: 'Elige la unidad.' }
  const v = esquemaVinculo.safeParse(datosFormulario(f))
  if (!v.success) return { error: v.error.issues[0].message }
  const { supabase } = await usuarioActual()

  let persona = personaFija ?? String(f.get('persona_id') ?? '')
  if (!esUuid(persona)) {
    if (persona !== 'nueva') return { error: 'Elige la persona o registra una nueva.' }
    const p = esquemaPersona.safeParse(datosFormulario(f))
    if (!p.success) return { error: p.error.issues[0].message }
    const { data: id, error } = await supabase.rpc('registrar_persona', {
      p_copro: copro,
      p_nombre: p.data.nombre,
      p_tipo_persona: p.data.tipo_persona,
      p_tipo_documento: p.data.tipo_documento,
      p_numero_documento: p.data.numero_documento,
      p_correo: p.data.correo,
      p_celular: p.data.celular,
      p_telefono: p.data.telefono,
    })
    if (error || typeof id !== 'string') return { error: mensajeError(error?.code, 'Ya existe una persona con ese documento. Elígela en la lista.') }
    persona = id
  }

  const { error } = await supabase
    .from('vinculos_unidad')
    .insert({ copropiedad_id: copro, unidad_id: unidad, persona_id: persona, ...v.data })
    .select('id')
  if (error) return { error: mensajeError(error.code, 'La unidad ya tiene un titular vigente, o la persona ya tiene ese vínculo con la unidad.') }
  refrescar(copro)
  redirect(regreso(copro, f, `/c/${copro}/unidades/${unidad}`))
}

export async function terminarVinculo(copro: string, vinculoId: string, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copro) || !esUuid(vinculoId)) return { error: SIN_PERMISO }
  const hasta = String(f.get('hasta') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: 'Escribe la fecha de fin.' }
  const { supabase } = await usuarioActual()
  const { data, error } = await supabase.from('vinculos_unidad').update({ hasta }).eq('id', vinculoId).eq('copropiedad_id', copro).select('id')
  if (error?.code === '23514') return { error: 'La fecha de fin no puede ser anterior a la de inicio.' }
  if (error || !data?.length) return { error: mensajeError(error?.code, '') }
  refrescar(copro)
  return { ok: 'Vínculo terminado. Queda en el historial.' }
}

export async function registrarAutorizacion(copro: string, personaId: string, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copro) || !esUuid(personaId)) return { error: SIN_PERMISO }
  const a = esquemaAutorizacion.safeParse({ ...datosFormulario(f), finalidades: f.getAll('finalidades').map(String) })
  if (!a.success) return { error: a.error.issues[0].message }
  const { supabase } = await usuarioActual()
  const { error } = await supabase
    .from('autorizaciones_datos')
    .insert({ copropiedad_id: copro, persona_id: personaId, ...a.data })
    .select('id')
  if (error) return { error: mensajeError(error.code, '') }
  refrescar(copro)
  return { ok: 'Autorización registrada.' }
}

export async function revocarAutorizacion(copro: string, autorizacionId: string, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copro) || !esUuid(autorizacionId)) return { error: SIN_PERMISO }
  const r = esquemaRevocacion.safeParse(datosFormulario(f))
  if (!r.success) return { error: r.error.issues[0].message }
  const { supabase } = await usuarioActual()
  const { data, error } = await supabase
    .from('autorizaciones_datos')
    .update(r.data)
    .eq('id', autorizacionId)
    .eq('copropiedad_id', copro)
    .is('revocada_en', null)
    .select('id')
  if (error?.code === '23514') return { error: 'La revocación no puede ser anterior a la autorización.' }
  if (error || !data?.length) return { error: mensajeError(error?.code, '') }
  refrescar(copro)
  return { ok: 'Revocación registrada.' }
}

export async function publicarPolitica(copro: string, _: Estado, f: FormData): Promise<Estado> {
  if (!esUuid(copro)) return { error: SIN_PERMISO }
  const p = esquemaPolitica.safeParse(datosFormulario(f))
  if (!p.success) return { error: p.error.issues[0].message }
  const { supabase } = await usuarioActual()
  const { error } = await supabase.from('politicas_tratamiento').insert({ copropiedad_id: copro, ...p.data }).select('id')
  if (error) return { error: mensajeError(error.code, `Ya existe la versión ${p.data.version}.`) }
  refrescar(copro)
  redirect(`/c/${copro}/personas/politica`)
}
