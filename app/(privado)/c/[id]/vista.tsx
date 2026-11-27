import { CircleCheck } from 'lucide-react'
import { Cabecera } from '@/components/ui/cabecera'
import { Cifras, type Cifra } from '@/components/ui/cifras'
import { Faltante } from '@/components/ui/faltante'
import { Fila, Filas, type Punto } from '@/components/ui/filas'
import { Vacio } from '@/components/ui/vacio'
import type { Copropiedad } from '@/lib/datos'
import { formatearNit, listarEnEspanol, type DatoIdentidad } from '@/lib/identidad'
import { TIPOS_COPROPIEDAD } from '@/lib/validacion'

const PROXIMOS = [
  ['Documentos y vencimientos', 'Sprint 4'],
  ['Tareas y alertas', 'Sprint 5'],
  ['Mantenimientos', 'Sprint 10'],
] as const

const fmt = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 6 })

export function VistaResumen({
  c,
  nombreLegal,
  faltanIdentidad,
  editarIdentidad,
  unidades,
  personas,
}: {
  c: Copropiedad
  /** undefined: la persona no ve la identidad (no se muestra como faltante). */
  nombreLegal: string | null | undefined
  faltanIdentidad: DatoIdentidad[]
  editarIdentidad: boolean
  unidades: { activas: number; suma: number } | null
  personas: { activas: number; sinAutorizacion: number; sinTitular: number; politica: boolean } | null
}) {
  const base = `/c/${c.id}`
  const cuadra = unidades ? Math.abs(unidades.suma - 100) < 0.0005 : true

  const atencion: { titulo: string; meta: string; punto: Punto; href?: string }[] = []
  if (unidades && unidades.activas > 0 && !cuadra)
    atencion.push({ titulo: 'Los coeficientes no suman 100 %', meta: `Suman ${fmt(unidades.suma)} % · Unidades`, punto: 'rojo', href: `${base}/unidades` })
  if (faltanIdentidad.length)
    atencion.push({
      titulo: 'Completa la identidad del edificio',
      meta: `Falta ${listarEnEspanol(faltanIdentidad)} · Identidad`,
      punto: 'ambar',
      href: editarIdentidad ? `${base}/marca` : undefined,
    })
  if (personas && !personas.politica)
    atencion.push({ titulo: 'Publica la política de datos', meta: 'Ley 1581 de 2012 · Personas', punto: 'ambar', href: `${base}/personas/politica` })
  if (personas && personas.sinTitular > 0)
    atencion.push({ titulo: `${personas.sinTitular} ${personas.sinTitular === 1 ? 'unidad sin titular' : 'unidades sin titular'}`, meta: 'Unidades', punto: 'ambar', href: `${base}/unidades` })
  if (personas && personas.sinAutorizacion > 0)
    atencion.push({
      titulo: `${personas.sinAutorizacion} ${personas.sinAutorizacion === 1 ? 'persona sin autorización' : 'personas sin autorización'}`,
      meta: 'Autorización de datos · Personas',
      punto: 'ambar',
      href: `${base}/personas?f=sin`,
    })

  const cifras: Cifra[] = []
  if (unidades) {
    cifras.push({ etiqueta: 'Unidades activas', valor: unidades.activas, href: `${base}/unidades` })
    cifras.push({
      etiqueta: 'Coeficientes',
      valor: `${fmt(unidades.suma)} %`,
      nota: unidades.activas === 0 ? 'Sin unidades' : cuadra ? 'Cuadra con el 100 %' : 'Debe sumar 100 %',
      punto: unidades.activas === 0 ? undefined : cuadra ? 'verde' : 'rojo',
    })
  }
  if (personas) {
    cifras.push({ etiqueta: 'Personas activas', valor: personas.activas, href: `${base}/personas` })
    cifras.push({
      etiqueta: 'Sin autorización',
      valor: personas.sinAutorizacion,
      nota: personas.sinAutorizacion ? 'Por registrar' : 'Al día',
      punto: personas.sinAutorizacion ? 'ambar' : 'verde',
      href: `${base}/personas?f=sin`,
    })
  }

  return (
    <>
      <Cabecera titulo={c.nombre} meta={`${TIPOS_COPROPIEDAD[c.tipo as keyof typeof TIPOS_COPROPIEDAD] ?? c.tipo} · Prefijo ${c.prefijo}${c.ciudad ? ` · ${c.ciudad}` : ''}`} />
      {cifras.length > 0 && <Cifras cifras={cifras} />}

      <div className="dos-columnas">
        <section>
          <div className="seccion-cabeza"><h2>Requiere atención</h2><span className="meta">{atencion.length || ''}</span></div>
          {atencion.length === 0 ? (
            <Vacio icono={CircleCheck} texto="Todo al día." />
          ) : (
            <Filas etiqueta="Requiere atención">
              {atencion.map((a) => <Fila key={a.titulo} {...a} />)}
            </Filas>
          )}
        </section>
        <div style={{ display: 'grid', gap: 28 }}>
          <section>
            <div className="seccion-cabeza"><h2>Datos básicos</h2></div>
            <div className="panel">
              <dl className="datos">
                {nombreLegal !== undefined && <><dt>Nombre completo</dt><dd>{nombreLegal ?? <Faltante />}</dd></>}
                <dt>NIT</dt><dd>{c.nit ? formatearNit(c.nit) : <Faltante />}</dd>
                <dt>Ciudad</dt><dd>{c.ciudad || <Faltante />}</dd>
                <dt>Dirección</dt><dd>{c.direccion || <Faltante />}</dd>
                <dt>Estado</dt><dd>{c.activa ? 'Activa' : 'Inactiva'}</dd>
              </dl>
            </div>
          </section>
          <section>
            <div className="seccion-cabeza"><h2>Lo que viene</h2></div>
            <Filas etiqueta="Próximos módulos">
              {PROXIMOS.map(([m, s]) => <Fila key={m} titulo={m} meta={s} />)}
            </Filas>
          </section>
        </div>
      </div>
    </>
  )
}
