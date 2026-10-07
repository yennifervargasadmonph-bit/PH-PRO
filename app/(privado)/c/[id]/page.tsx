import Link from 'next/link'
import { notFound } from 'next/navigation'
import { leerCopropiedad, misPermisos, puede, usuarioActual } from '@/lib/datos'
import { TIPOS_COPROPIEDAD } from '@/lib/validacion'

export const metadata = { title: 'Copropiedad' }

const PROXIMOS = [
  ['Personas y autorización de datos', 'Sprint 3'],
  ['Documentos y vencimientos', 'Sprint 4'],
  ['Tareas y alertas', 'Sprint 5'],
  ['Mantenimientos', 'Sprint 10'],
] as const

export default async function PaginaCopropiedad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await leerCopropiedad(id)
  if (!c) notFound()
  const permisos = await misPermisos(id)
  const { supabase } = await usuarioActual()
  const verUnidades = puede(permisos, 'unidades', 'V')
  const { data: resumen } = verUnidades ? await supabase.rpc('resumen_coeficientes', { p_copro: id }).single<{ unidades: number; suma: string }>() : { data: null }
  const suma = Number(resumen?.suma ?? 0)
  const cuadra = Math.abs(suma - 100) < 0.0005

  return (
    <>
      <div className="cabecera">
        <div>
          <p className="tenue pequeno" style={{ margin: 0 }}>{TIPOS_COPROPIEDAD[c.tipo as keyof typeof TIPOS_COPROPIEDAD] ?? c.tipo} · Prefijo {c.prefijo}</p>
          <h1>{c.nombre}</h1>
        </div>
      </div>

      {verUnidades && resumen && (
        <div className="cifras">
          <div className="cifra"><span>Unidades activas</span><strong>{resumen.unidades}</strong></div>
          <div className={`cifra ${resumen.unidades === 0 ? '' : cuadra ? 'bien' : 'alerta'}`}>
            <span>Suma de coeficientes</span>
            <strong>{suma.toLocaleString('es-CO', { maximumFractionDigits: 6 })} %</strong>
            {resumen.unidades > 0 && !cuadra && <span>Debe sumar 100 %. <Link href={`/c/${id}/unidades`}>Revisar</Link></span>}
          </div>
        </div>
      )}

      <div className="rejilla">
        <section className="tarjeta">
          <h3>Datos básicos</h3>
          <dl className="datos">
            <dt>NIT</dt><dd>{c.nit ?? '—'}</dd>
            <dt>Ciudad</dt><dd>{c.ciudad || '—'}</dd>
            <dt>Dirección</dt><dd>{c.direccion || '—'}</dd>
            <dt>Estado</dt><dd>{c.activa ? 'Activa' : 'Inactiva'}</dd>
          </dl>
        </section>
        <section className="tarjeta">
          <h3>Lo que viene</h3>
          <ul className="lista">
            {PROXIMOS.map(([m, s]) => <li key={m}><span>{m}</span><span className="etiqueta gris">{s}</span></li>)}
          </ul>
        </section>
      </div>
    </>
  )
}
