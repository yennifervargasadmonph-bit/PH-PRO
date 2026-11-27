import { notFound } from 'next/navigation'
import { misPermisos, puede, usuarioActual } from '@/lib/datos'
import type { Politica } from '@/lib/personas'
import { VistaPolitica } from './vista'

export const metadata = { title: 'Política de datos' }

export default async function PaginaPolitica({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; nueva?: string }> }) {
  const { id } = await params
  const { v, nueva } = await searchParams
  const permisos = await misPermisos(id)
  if (!puede(permisos, 'personas', 'V')) notFound()
  const { supabase } = await usuarioActual()
  const { data } = await supabase
    .from('politicas_tratamiento')
    .select('id, version, vigente_desde, meses_conservacion, texto, creado_en')
    .eq('copropiedad_id', id)
    .order('vigente_desde', { ascending: false })
  return <VistaPolitica copro={id} politicas={(data ?? []) as Politica[]} aprobar={puede(permisos, 'personas', 'A')} seleccion={v} nueva={nueva === '1'} />
}
