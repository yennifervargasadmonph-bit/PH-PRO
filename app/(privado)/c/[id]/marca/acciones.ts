'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { usuarioActual } from '@/lib/datos'
import { validarLogo } from '@/lib/identidad'
import { BUCKET_MARCAS } from '@/lib/identidad-servidor'
import { datosFormulario, esquemaIdentidad } from '@/lib/validacion'

export type Estado = { error?: string; ok?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIN_PERMISO = 'Solo la administración puede cambiar la identidad de esta copropiedad.'

const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Elige un color válido.')
const esquema = esquemaIdentidad.extend({
  color_primario: color,
  color_secundario: color,
  representante_legal: z.string().trim().max(120),
  correo: z.union([z.literal(''), z.email('Escribe un correo válido.')]),
  telefono: z.string().trim().max(40),
  eslogan: z.string().trim().max(120, 'El eslogan admite hasta 120 caracteres.'),
})

const refrescar = (id: string) => {
  revalidatePath(`/c/${id}`, 'layout')
}

/** Guarda nombre completo, NIT, celular y los demás datos de identidad en una sola operación. */
export async function guardarIdentidad(copropiedadId: string, _: Estado, f: FormData): Promise<Estado> {
  if (!UUID.test(copropiedadId)) return { error: SIN_PERMISO }
  const datos = esquema.safeParse(datosFormulario(f))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const d = datos.data
  const { supabase } = await usuarioActual()
  const { error } = await supabase.rpc('guardar_identidad', {
    p_copro: copropiedadId,
    p_nombre_legal: d.nombre_legal,
    p_nit: d.nit,
    p_celular: d.celular,
    p_representante_legal: d.representante_legal,
    p_correo: d.correo,
    p_telefono: d.telefono,
    p_eslogan: d.eslogan,
    p_color_primario: d.color_primario,
    p_color_secundario: d.color_secundario,
  })
  if (error) {
    if (error.code === '42501') return { error: SIN_PERMISO }
    if (error.code === '23514') return { error: 'Algún dato no tiene el formato esperado. Revisa el NIT y el celular.' }
    return { error: 'No pudimos guardar la identidad. Inténtalo de nuevo.' }
  }
  refrescar(copropiedadId)
  return { ok: 'Identidad del edificio guardada.' }
}

/** Sube (o reemplaza) el logo en el bucket privado: <copropiedad_id>/logo.<ext>. */
export async function subirLogo(copropiedadId: string, _: Estado, f: FormData): Promise<Estado> {
  if (!UUID.test(copropiedadId)) return { error: SIN_PERMISO }
  const archivo = f.get('logo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elige una imagen para el logo.' }
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const revision = validarLogo(archivo.type, bytes)
  if (!revision.ok) return { error: revision.error }

  const { supabase } = await usuarioActual()
  const { data: actual, error: errorLectura } = await supabase
    .from('marcas_copropiedad')
    .select('logo_ruta')
    .eq('copropiedad_id', copropiedadId)
    .maybeSingle<{ logo_ruta: string | null }>()
  if (errorLectura || !actual) return { error: SIN_PERMISO }

  const ruta = `${copropiedadId.toLowerCase()}/logo.${revision.extension}`
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_MARCAS)
    .upload(ruta, bytes, { contentType: archivo.type, upsert: true, cacheControl: '60' })
  if (errorSubida) return { error: 'No pudimos guardar el logo. Verifica que tengas permiso e inténtalo de nuevo.' }

  const { data, error } = await supabase.from('marcas_copropiedad').update({ logo_ruta: ruta }).eq('copropiedad_id', copropiedadId).select('copropiedad_id')
  if (error || !data?.length) {
    await supabase.storage.from(BUCKET_MARCAS).remove([ruta])
    return { error: SIN_PERMISO }
  }
  // Si cambió el formato (por ejemplo de PNG a SVG), el archivo anterior ya no se usa.
  if (actual.logo_ruta && actual.logo_ruta !== ruta) await supabase.storage.from(BUCKET_MARCAS).remove([actual.logo_ruta])

  refrescar(copropiedadId)
  return { ok: 'Logo actualizado.' }
}

/** Quita el logo: se borra el archivo y la identidad queda sin logo (aparece como «Dato faltante»). */
export async function quitarLogo(copropiedadId: string): Promise<Estado> {
  if (!UUID.test(copropiedadId)) return { error: SIN_PERMISO }
  const { supabase } = await usuarioActual()
  const { data: actual } = await supabase
    .from('marcas_copropiedad')
    .select('logo_ruta')
    .eq('copropiedad_id', copropiedadId)
    .maybeSingle<{ logo_ruta: string | null }>()
  if (!actual?.logo_ruta) return { ok: 'La copropiedad no tiene logo.' }
  const { data, error } = await supabase.from('marcas_copropiedad').update({ logo_ruta: null }).eq('copropiedad_id', copropiedadId).select('copropiedad_id')
  if (error || !data?.length) return { error: SIN_PERMISO }
  await supabase.storage.from(BUCKET_MARCAS).remove([actual.logo_ruta])
  refrescar(copropiedadId)
  return { ok: 'Logo quitado.' }
}
