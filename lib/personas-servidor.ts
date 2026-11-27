import 'server-only'
import { usuarioActual } from '@/lib/datos'
import type { Autorizacion, DatosPersona, Persona, Politica, Vinculo } from '@/lib/personas'

export type UnidadCorta = { id: string; torre: string; numero: string; activa: boolean }

export type DatosPersonas = {
  personas: Persona[]
  datos: Map<string, DatosPersona>
  vinculos: Vinculo[]
  autorizaciones: Autorizacion[]
  politicas: Politica[]
  unidades: UnidadCorta[]
}

/**
 * Personas de una copropiedad con sus vínculos, autorizaciones y políticas. RLS decide qué
 * llega: sin «datos_personales V» la tabla de documento y contacto viene vacía.
 */
export async function cargarPersonas(copropiedadId: string, verDatos: boolean): Promise<DatosPersonas> {
  const { supabase } = await usuarioActual()
  const [personas, datos, vinculos, autorizaciones, politicas, unidades] = await Promise.all([
    supabase.from('personas').select('id, copropiedad_id, tipo_persona, nombre, activa, conservar_hasta').eq('copropiedad_id', copropiedadId).order('nombre').limit(5000),
    verDatos
      ? supabase.from('personas_datos').select('persona_id, tipo_documento, numero_documento, correo, celular, telefono').eq('copropiedad_id', copropiedadId).limit(5000)
      : Promise.resolve({ data: [] }),
    supabase.from('vinculos_unidad').select('id, unidad_id, persona_id, tipo, es_titular, reside, desde, hasta').eq('copropiedad_id', copropiedadId).limit(10000),
    supabase
      .from('autorizaciones_datos')
      .select('id, persona_id, politica_id, canal, otorgada_en, finalidades, registrada_en, revocada_en, revocacion_canal')
      .eq('copropiedad_id', copropiedadId)
      .order('otorgada_en', { ascending: false })
      .limit(10000),
    supabase.from('politicas_tratamiento').select('id, version, vigente_desde, meses_conservacion, texto, creado_en').eq('copropiedad_id', copropiedadId).order('vigente_desde', { ascending: false }),
    supabase.from('unidades').select('id, torre, numero, activa').eq('copropiedad_id', copropiedadId).limit(5000),
  ])
  return {
    personas: (personas.data ?? []) as Persona[],
    datos: new Map(((datos.data ?? []) as DatosPersona[]).map((d) => [d.persona_id, d])),
    vinculos: (vinculos.data ?? []) as Vinculo[],
    autorizaciones: (autorizaciones.data ?? []) as Autorizacion[],
    politicas: (politicas.data ?? []) as Politica[],
    unidades: ((unidades.data ?? []) as UnidadCorta[]).sort(
      (a, b) => a.torre.localeCompare(b.torre, 'es', { numeric: true }) || a.numero.localeCompare(b.numero, 'es', { numeric: true }),
    ),
  }
}
