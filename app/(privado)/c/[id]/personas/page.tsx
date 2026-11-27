import { notFound } from 'next/navigation'
import { misPermisos, puede } from '@/lib/datos'
import { cargarPersonas } from '@/lib/personas-servidor'
import { VistaPersonas, type FiltroPersonas } from './vista'

export const metadata = { title: 'Personas' }

export default async function Personas({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; f?: string; p?: string; editar?: string; nueva?: string }>
}) {
  const { id } = await params
  const { q = '', f, p, editar, nueva } = await searchParams
  const permisos = await misPermisos(id)
  if (!puede(permisos, 'personas', 'V')) notFound()
  const verDatos = puede(permisos, 'datos_personales', 'V')
  const d = await cargarPersonas(id, verDatos)
  const filtro: FiltroPersonas = f === 'sin' || f === 'inactivas' ? f : 'todas'
  return (
    <VistaPersonas
      copro={id}
      d={d}
      permisos={{
        verDatos,
        crear: puede(permisos, 'personas', 'C'),
        editar: puede(permisos, 'personas', 'E'),
        inactivar: puede(permisos, 'personas', 'I'),
        aprobar: puede(permisos, 'personas', 'A'),
        verUnidades: puede(permisos, 'unidades', 'V'),
      }}
      q={q.slice(0, 80)}
      filtro={filtro}
      seleccion={p}
      editando={editar === '1'}
      nueva={nueva === '1'}
    />
  )
}
