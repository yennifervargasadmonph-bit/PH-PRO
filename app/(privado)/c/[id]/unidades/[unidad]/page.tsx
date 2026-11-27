import { notFound } from 'next/navigation'
import { z } from 'zod'
import { misPermisos, puede, usuarioActual } from '@/lib/datos'
import { cargarPersonas } from '@/lib/personas-servidor'
import type { Unidad } from '@/lib/unidades'
import { VistaExpediente, type EventoHistorial } from './vista'

export const metadata = { title: 'Expediente de unidad' }

export default async function Expediente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; unidad: string }>
  searchParams: Promise<{ p?: string; editar?: string; vincular?: string }>
}) {
  const { id, unidad: unidadId } = await params
  const { p, editar, vincular } = await searchParams
  if (!z.uuid().safeParse(unidadId).success) notFound()
  const permisos = await misPermisos(id)
  // Portería no abre expedientes: solo ve su listado de residentes.
  if (!puede(permisos, 'personas', 'V') || !puede(permisos, 'unidades', 'V')) notFound()
  const { supabase } = await usuarioActual()
  const verDatos = puede(permisos, 'datos_personales', 'V')
  const [{ data: unidad }, d, { data: historial }] = await Promise.all([
    supabase.from('unidades').select('*').eq('id', unidadId).eq('copropiedad_id', id).maybeSingle<Unidad>(),
    cargarPersonas(id, verDatos),
    supabase.rpc('historial_unidad', { p_unidad: unidadId }),
  ])
  if (!unidad) notFound()
  return (
    <VistaExpediente
      copro={id}
      unidad={unidad}
      d={d}
      historial={(historial ?? []) as EventoHistorial[]}
      permisos={{
        verDatos,
        crear: puede(permisos, 'personas', 'C'),
        editar: puede(permisos, 'personas', 'E'),
        inactivar: puede(permisos, 'personas', 'I'),
        aprobar: puede(permisos, 'personas', 'A'),
        verUnidades: true,
      }}
      editarUnidad={puede(permisos, 'unidades', 'E')}
      seleccion={p}
      editando={editar === '1'}
      vinculando={vincular === '1'}
    />
  )
}
