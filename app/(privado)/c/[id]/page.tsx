import { notFound } from 'next/navigation'
import { leerCopropiedad, misPermisos, puede, usuarioActual } from '@/lib/datos'
import { faltantesIdentidad } from '@/lib/identidad'
import { obtenerIdentidad } from '@/lib/identidad-servidor'
import { estadoAutorizacion, vinculoVigente } from '@/lib/personas'
import { cargarPersonas } from '@/lib/personas-servidor'
import { VistaResumen } from './vista'

export const metadata = { title: 'Copropiedad' }

export default async function PaginaCopropiedad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await leerCopropiedad(id)
  if (!c) notFound()
  const permisos = await misPermisos(id)
  const { supabase } = await usuarioActual()
  const verUnidades = puede(permisos, 'unidades', 'V')
  const verPersonas = puede(permisos, 'personas', 'V')
  const [{ data: resumen }, identidad, d] = await Promise.all([
    verUnidades ? supabase.rpc('resumen_coeficientes', { p_copro: id }).single<{ unidades: number; suma: string }>() : Promise.resolve({ data: null }),
    puede(permisos, 'perfil', 'V') ? obtenerIdentidad(id) : Promise.resolve(null),
    verPersonas ? cargarPersonas(id, false) : Promise.resolve(null),
  ])

  const personas = d
    ? (() => {
        const activas = d.personas.filter((p) => p.activa)
        const sinAut = activas.filter((p) => estadoAutorizacion(d.autorizaciones.filter((a) => a.persona_id === p.id)) !== 'vigente').length
        const conTitular = new Set(d.vinculos.filter((v) => v.es_titular && vinculoVigente(v)).map((v) => v.unidad_id))
        const sinTitular = d.unidades.filter((u) => u.activa && !conTitular.has(u.id)).length
        return { activas: activas.length, sinAutorizacion: sinAut, sinTitular, politica: d.politicas.length > 0 }
      })()
    : null

  return (
    <VistaResumen
      c={c}
      nombreLegal={identidad ? identidad.nombreLegal ?? null : undefined}
      faltanIdentidad={identidad ? faltantesIdentidad(identidad) : []}
      editarIdentidad={puede(permisos, 'perfil', 'E')}
      unidades={resumen ? { activas: resumen.unidades, suma: Number(resumen.suma) } : null}
      personas={personas}
    />
  )
}
