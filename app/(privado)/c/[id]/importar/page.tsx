import { notFound } from 'next/navigation'
import { misPermisos, puede, usuarioActual } from '@/lib/datos'
import type { UnidadExistente } from '@/lib/importacion/unidades'
import { Importador } from './importador'

export const metadata = { title: 'Importar unidades' }

type Registro = { id: string; archivo: string; total: number; nuevas: number; actualizadas: number; sin_cambios: number; rechazadas: number; creado_en: string }

export default async function Importar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const permisos = await misPermisos(id)
  if (!puede(permisos, 'importar', 'V')) notFound()
  const { supabase } = await usuarioActual()
  const [{ data: unidades }, { data: historial }] = await Promise.all([
    supabase.from('unidades').select('torre, numero, tipo, coeficiente, area_m2, matricula_inmobiliaria, activa').eq('copropiedad_id', id).limit(5000),
    supabase.from('importaciones').select('id, archivo, total, nuevas, actualizadas, sin_cambios, rechazadas, creado_en').eq('copropiedad_id', id).order('creado_en', { ascending: false }).limit(20),
  ])
  const existentes = (unidades ?? []).map((u) => ({
    ...u,
    coeficiente: Number(u.coeficiente),
    area_m2: u.area_m2 === null ? null : Number(u.area_m2),
  })) as UnidadExistente[]

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Importar unidades</h1>
          <p className="tenue">Si la unidad ya existe (misma torre y número) se actualiza; si no, se crea. Nunca se duplica.</p>
        </div>
      </div>
      <Importador copropiedadId={id} existentes={existentes} puedeAprobar={puede(permisos, 'importar', 'A')} />
      {(historial?.length ?? 0) > 0 && (
        <section className="panel seccion">
          <h2>Importaciones anteriores</h2>
          <ul className="lista">
            {(historial as Registro[]).map((h) => (
              <li key={h.id}>
                <span><strong>{h.archivo}</strong> · {h.nuevas} nuevas, {h.actualizadas} actualizadas, {h.sin_cambios} sin cambios, {h.rechazadas} rechazadas</span>
                <span className="tenue">{new Date(h.creado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
