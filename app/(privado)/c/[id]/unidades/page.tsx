import { notFound } from 'next/navigation'
import { misPermisos, puede, usuarioActual } from '@/lib/datos'
import { vinculoVigente, type Vinculo } from '@/lib/personas'
import type { Unidad } from '@/lib/unidades'
import { VistaUnidades } from './vista'

export const metadata = { title: 'Unidades' }

export default async function Unidades({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; inactivas?: string; editar?: string; nueva?: string }>
}) {
  const { id } = await params
  const { q = '', inactivas, editar, nueva } = await searchParams
  const permisos = await misPermisos(id)
  if (!puede(permisos, 'unidades', 'V')) notFound()
  const { supabase } = await usuarioActual()
  const verPersonas = puede(permisos, 'personas', 'V')
  const [{ data }, titulares] = await Promise.all([
    supabase.from('unidades').select('*').eq('copropiedad_id', id).order('torre').order('numero').limit(5000),
    verPersonas
      ? supabase
          .from('vinculos_unidad')
          .select('unidad_id, desde, hasta, personas (nombre)')
          .eq('copropiedad_id', id)
          .eq('es_titular', true)
          .is('hasta', null)
          .limit(5000)
      : Promise.resolve({ data: null }),
  ])
  const mapa = titulares.data
    ? new Map(
        (titulares.data as unknown as (Pick<Vinculo, 'unidad_id' | 'desde' | 'hasta'> & { personas: { nombre: string } | null })[])
          .filter((t) => vinculoVigente(t))
          .map((t) => [t.unidad_id, t.personas?.nombre ?? 'Titular']),
      )
    : null
  return (
    <VistaUnidades
      copro={id}
      unidades={(data ?? []) as Unidad[]}
      titulares={mapa}
      permisos={{
        crear: puede(permisos, 'unidades', 'C'),
        editar: puede(permisos, 'unidades', 'E'),
        inactivar: puede(permisos, 'unidades', 'I'),
        importar: puede(permisos, 'importar', 'V'),
        // Portería solo ve número, tipo y coeficiente (matriz de permisos).
        detalle: puede(permisos, 'perfil', 'V'),
        expediente: verPersonas,
      }}
      q={q.slice(0, 80)}
      inactivas={Boolean(inactivas)}
      editar={editar}
      nueva={nueva === '1'}
    />
  )
}
