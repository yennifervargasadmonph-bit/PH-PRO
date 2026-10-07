import Link from 'next/link'
import { notFound } from 'next/navigation'
import { usuarioActual, type Copropiedad } from '@/lib/datos'
import { TIPOS_COPROPIEDAD } from '@/lib/validacion'

export const metadata = { title: 'Copropiedad' }

const PROXIMOS = [
  ['Unidades y coeficientes', 'Sprint 2'],
  ['Personas y autorización de datos', 'Sprint 3'],
  ['Documentos y vencimientos', 'Sprint 4'],
  ['Tareas y alertas', 'Sprint 5'],
] as const

export default async function PaginaCopropiedad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { supabase } = await usuarioActual()
  // RLS: si la persona no tiene acceso, la consulta no devuelve nada.
  const { data } = await supabase.from('copropiedades').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const c = data as Copropiedad

  return (
    <>
      <div className="trabajando" role="status">
        <span>Trabajando actualmente en: <strong>{c.nombre.toUpperCase()}</strong></span>
        <Link href="/central">Cambiar</Link>
      </div>
      <div className="cabecera">
        <div>
          <p className="tenue pequeno" style={{ margin: 0 }}>{TIPOS_COPROPIEDAD[c.tipo as keyof typeof TIPOS_COPROPIEDAD] ?? c.tipo} · Prefijo {c.prefijo}</p>
          <h1>{c.nombre}</h1>
        </div>
      </div>
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
