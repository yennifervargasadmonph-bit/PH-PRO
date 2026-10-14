import 'server-only'
import { cache } from 'react'
import { leerCopropiedad, usuarioActual } from '@/lib/datos'
import type { Identidad } from '@/lib/identidad'

export const BUCKET_MARCAS = 'marcas'
const VIGENCIA_URL_LOGO = 60 * 60 // una hora

type FilaMarca = {
  nombre_legal: string | null
  celular: string | null
  logo_ruta: string | null
  representante_legal: string
  correo: string
  telefono: string
  eslogan: string
  color_primario: string
  color_secundario: string
}

/**
 * Identidad de la copropiedad para el membrete y el pie de los documentos.
 * Respeta RLS: devuelve null si la persona no puede ver la copropiedad o su perfil.
 * El logo llega como URL firmada y temporal (el bucket es privado).
 */
export const obtenerIdentidad = cache(async (copropiedadId: string): Promise<Identidad | null> => {
  const c = await leerCopropiedad(copropiedadId)
  if (!c) return null
  const { supabase } = await usuarioActual()
  const { data: m } = await supabase
    .from('marcas_copropiedad')
    .select('nombre_legal, celular, logo_ruta, representante_legal, correo, telefono, eslogan, color_primario, color_secundario')
    .eq('copropiedad_id', copropiedadId)
    .maybeSingle<FilaMarca>()
  if (!m) return null

  let logoUrl: string | null = null
  if (m.logo_ruta) {
    const { data } = await supabase.storage.from(BUCKET_MARCAS).createSignedUrl(m.logo_ruta, VIGENCIA_URL_LOGO)
    logoUrl = data?.signedUrl ?? null
  }

  return {
    copropiedadId,
    nombre: c.nombre,
    nombreLegal: m.nombre_legal,
    nit: c.nit,
    celular: m.celular,
    direccion: c.direccion,
    ciudad: c.ciudad,
    correo: m.correo,
    telefono: m.telefono,
    representanteLegal: m.representante_legal,
    eslogan: m.eslogan,
    colorPrimario: m.color_primario,
    colorSecundario: m.color_secundario,
    prefijo: c.prefijo,
    logoRuta: m.logo_ruta,
    logoUrl,
  }
})
