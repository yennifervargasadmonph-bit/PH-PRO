import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Cabecera } from '@/components/ui/cabecera'
import { Cifras } from '@/components/ui/cifras'
import { Fila, FilaAgregar, Filas } from '@/components/ui/filas'
import { PanelLateral } from '@/components/ui/panel-lateral'
import { Vacio } from '@/components/ui/vacio'
import { TIPOS_UNIDAD } from '@/lib/importacion/unidades'
import { nombreUnidad, type Unidad } from '@/lib/unidades'
import { cambiarEstadoUnidad } from './acciones'
import { FormularioUnidad } from './formulario'

const fmt = (v: string | number | null, d = 6) => (v === null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d }))

export function VistaUnidades({
  copro,
  unidades,
  titulares,
  permisos,
  q,
  inactivas,
  editar,
  nueva,
}: {
  copro: string
  unidades: Unidad[]
  /** Titular vigente por unidad, o null si la persona no ve personas. */
  titulares: Map<string, string> | null
  permisos: { crear: boolean; editar: boolean; inactivar: boolean; importar: boolean; detalle: boolean; expediente: boolean }
  q: string
  inactivas: boolean
  editar?: string
  nueva: boolean
}) {
  const ruta = `/c/${copro}/unidades`
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (inactivas) params.set('inactivas', '1')
  const base = params.size ? `${ruta}?${params}` : ruta
  const sep = base.includes('?') ? '&' : '?'

  const activas = unidades.filter((u) => u.activa)
  const suma = activas.reduce((s, u) => s + Number(u.coeficiente), 0)
  const cuadra = Math.abs(suma - 100) < 0.0005
  const busqueda = q.trim().toUpperCase()
  const lista = unidades
    .filter((u) => inactivas || u.activa)
    .filter((u) => !busqueda || `${u.torre} ${u.numero} ${u.matricula_inmobiliaria} ${titulares?.get(u.id) ?? ''}`.toUpperCase().includes(busqueda))
    .sort((a, b) => a.torre.localeCompare(b.torre, 'es', { numeric: true }) || a.numero.localeCompare(b.numero, 'es', { numeric: true }))
  const enEdicion = permisos.editar && editar ? unidades.find((u) => u.id === editar) : undefined
  const sinTitular = titulares ? activas.filter((u) => !titulares.has(u.id)).length : 0

  const meta = (u: Unidad) => {
    const partes: string[] = [TIPOS_UNIDAD[u.tipo]]
    if (titulares) partes.push(titulares.has(u.id) ? `Titular: ${titulares.get(u.id)}` : 'Sin titular')
    if (permisos.detalle && u.area_m2) partes.push(`${fmt(u.area_m2, 2)} m²`)
    if (!u.activa) partes.push('Inactiva')
    return partes.join(' · ')
  }
  const enlace = (u: Unidad) => (permisos.expediente ? `${ruta}/${u.id}` : permisos.editar ? `${base}${sep}editar=${u.id}` : undefined)

  const mas = [
    ...(permisos.importar ? [{ href: `/c/${copro}/importar`, texto: 'Importar desde Excel' }] : []),
    inactivas ? { href: ruta, texto: 'Ocultar inactivas' } : { href: `${ruta}?inactivas=1`, texto: 'Mostrar inactivas' },
  ]

  return (
    <>
      <Cabecera
        titulo="Unidades"
        meta={`${activas.length} activas · coeficientes ${fmt(suma)} %`}
        accion={permisos.crear ? <Link className="boton" href={`${base}${sep}nueva=1`} scroll={false}>Agregar unidad</Link> : undefined}
        mas={mas}
      />

      <Cifras
        cifras={[
          { etiqueta: 'Unidades activas', valor: activas.length, nota: titulares ? (sinTitular ? `${sinTitular} sin titular` : 'Todas con titular') : undefined, punto: titulares ? (sinTitular ? 'ambar' : 'verde') : undefined },
          {
            etiqueta: 'Suma de coeficientes',
            valor: `${fmt(suma)} %`,
            nota: activas.length === 0 ? undefined : cuadra ? 'Cuadra con el 100 %' : `Diferencia: ${fmt(100 - suma)} puntos`,
            punto: activas.length === 0 ? undefined : cuadra ? 'verde' : 'rojo',
          },
        ]}
      />

      <form className="busqueda" role="search" action={ruta}>
        {inactivas && <input type="hidden" name="inactivas" value="1" />}
        <input name="q" defaultValue={q} placeholder={titulares ? 'Torre, número, matrícula o titular' : 'Torre, número o matrícula'} aria-label="Buscar unidades" />
        <button className="boton secundario">Buscar</button>
      </form>

      {lista.length === 0 ? (
        <Vacio icono={Building2} texto={unidades.length === 0 ? 'Todavía no hay unidades.' : 'Ninguna unidad coincide.'}>
          {permisos.crear && unidades.length === 0 && <FilaAgregar href={`${base}${sep}nueva=1`} texto="Agregar unidad" />}
        </Vacio>
      ) : (
        <>
          <Filas etiqueta="Unidades">
            {lista.map((u) => (
              <Fila
                key={u.id}
                titulo={nombreUnidad(u)}
                meta={meta(u)}
                derecha={`${fmt(u.coeficiente)} %`}
                punto={titulares && u.activa && !titulares.has(u.id) ? 'ambar' : null}
                href={enlace(u)}
                actual={u.id === editar}
                inactiva={!u.activa}
              />
            ))}
          </Filas>
          {permisos.crear && <FilaAgregar href={`${base}${sep}nueva=1`} texto="Agregar unidad" />}
        </>
      )}

      {nueva && permisos.crear && (
        <PanelLateral titulo="Agregar unidad" meta="Torre, número y coeficiente de copropiedad." cerrar={base}>
          <FormularioUnidad copropiedadId={copro} />
        </PanelLateral>
      )}
      {enEdicion && (
        <PanelLateral titulo={`Editar ${nombreUnidad(enEdicion)}`} meta={enEdicion.activa ? 'Activa' : 'Inactiva'} cerrar={base}>
          <FormularioUnidad copropiedadId={copro} unidad={enEdicion} />
          {permisos.inactivar && (
            <form action={cambiarEstadoUnidad.bind(null, copro, enEdicion.id, !enEdicion.activa)}>
              <button className="boton secundario">{enEdicion.activa ? 'Inactivar unidad' : 'Reactivar unidad'}</button>
            </form>
          )}
          {permisos.expediente && <Link className="boton fantasma" href={`${ruta}/${enEdicion.id}`}>Abrir expediente</Link>}
        </PanelLateral>
      )}
    </>
  )
}
