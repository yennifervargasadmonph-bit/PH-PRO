import { notFound } from 'next/navigation'
import { misPermisos, puede, usuarioActual } from '@/lib/datos'
import { VistaPorteria, type Residente } from './vista'

export const metadata = { title: 'Portería' }

export default async function Porteria({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params
  const { q = '' } = await searchParams
  const permisos = await misPermisos(id)
  if (!puede(permisos, 'porteria', 'V')) notFound()
  const { supabase } = await usuarioActual()
  // Función de la base: solo nombres y unidad, sin documento ni contacto.
  const { data } = await supabase.rpc('residentes_porteria', { p_copro: id })
  return <VistaPorteria copro={id} residentes={(data ?? []) as Residente[]} q={q.slice(0, 80)} />
}
