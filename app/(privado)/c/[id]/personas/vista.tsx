import Link from 'next/link'
import { UsersRound } from 'lucide-react'
import { Cabecera } from '@/components/ui/cabecera'
import { Fila, FilaAgregar, Filas } from '@/components/ui/filas'
import { PanelLateral } from '@/components/ui/panel-lateral'
import { Vacio } from '@/components/ui/vacio'
import { nombreUnidad } from '@/lib/unidades'
import { TIPOS_VINCULO, estadoAutorizacion, puntoAutorizacion, vinculoVigente, type TipoVinculo } from '@/lib/personas'
import type { DatosPersonas } from '@/lib/personas-servidor'
import { FormularioPersona } from './formularios'
import { PanelPersona, type PermisosPersonas } from './panel-persona'

export type FiltroPersonas = 'todas' | 'sin' | 'inactivas'

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function VistaPersonas({
  copro,
  d,
  permisos,
  q,
  filtro,
  seleccion,
  editando,
  nueva,
}: {
  copro: string
  d: DatosPersonas
  permisos: PermisosPersonas
  q: string
  filtro: FiltroPersonas
  seleccion?: string
  editando: boolean
  nueva: boolean
}) {
  const ruta = `/c/${copro}/personas`
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (filtro !== 'todas') params.set('f', filtro)
  const base = params.size ? `${ruta}?${params}` : ruta
  const sep = base.includes('?') ? '&' : '?'

  const nombreU = new Map(d.unidades.map((u) => [u.id, nombreUnidad(u)]))
  const autorizacionesDe = (id: string) => d.autorizaciones.filter((a) => a.persona_id === id)
  const vinculosDe = (id: string) => d.vinculos.filter((v) => v.persona_id === id)

  const activas = d.personas.filter((p) => p.activa)
  const sinAutorizacion = activas.filter((p) => estadoAutorizacion(autorizacionesDe(p.id)) !== 'vigente')
  const base0 = filtro === 'inactivas' ? d.personas.filter((p) => !p.activa) : filtro === 'sin' ? sinAutorizacion : activas
  const buscada = normalizar(q.trim())
  const lista = base0.filter((p) => {
    if (!buscada) return true
    const doc = d.datos.get(p.id)?.numero_documento ?? ''
    const unidades = vinculosDe(p.id).map((v) => nombreU.get(v.unidad_id) ?? '').join(' ')
    return normalizar(`${p.nombre} ${doc} ${unidades}`).includes(buscada)
  })

  const resumenVinculos = (id: string) => {
    const vig = vinculosDe(id).filter((v) => vinculoVigente(v))
    if (!vig.length) return 'Sin vínculos vigentes'
    const porTipo = new Map<TipoVinculo, string[]>()
    for (const v of vig) porTipo.set(v.tipo, [...(porTipo.get(v.tipo) ?? []), nombreU.get(v.unidad_id) ?? 'Unidad'])
    return [...porTipo].map(([t, us]) => `${TIPOS_VINCULO[t]} · ${us.join(', ')}`).join(' · ')
  }

  const seleccionada = seleccion ? d.personas.find((p) => p.id === seleccion) : undefined
  const unidadesActivas = d.unidades.filter((u) => u.activa).map((u) => ({ id: u.id, nombre: nombreUnidad(u) }))
  const segmento = (f: FiltroPersonas, texto: string, n: number) => {
    const p = new URLSearchParams(q ? { q } : {})
    if (f !== 'todas') p.set('f', f)
    return (
      <Link href={p.size ? `${ruta}?${p}` : ruta} aria-current={filtro === f ? 'true' : undefined}>
        {texto} <span>{n}</span>
      </Link>
    )
  }

  return (
    <>
      <Cabecera
        titulo="Personas"
        meta={`${activas.length} activas · ${sinAutorizacion.length} sin autorización vigente`}
        accion={permisos.crear ? <Link className="boton" href={`${base}${sep}nueva=1`} scroll={false}>Agregar persona</Link> : undefined}
        mas={[{ href: `${ruta}/politica`, texto: 'Política de datos' }]}
      />

      {permisos.crear && d.politicas.length === 0 && (
        <p className="aviso info seccion-aviso">
          Falta la política de tratamiento de datos (Ley 1581 de 2012).{' '}
          {permisos.aprobar ? <Link href={`${ruta}/politica?nueva=1`}>Publicarla</Link> : 'La administración debe publicarla.'}
        </p>
      )}

      <form className="busqueda" role="search" action={ruta}>
        {filtro !== 'todas' && <input type="hidden" name="f" value={filtro} />}
        <input name="q" defaultValue={q} placeholder={permisos.verDatos ? 'Nombre, documento o unidad' : 'Nombre o unidad'} aria-label="Buscar personas" />
        <button className="boton secundario">Buscar</button>
      </form>
      <nav className="segmentos" aria-label="Filtrar personas">
        {segmento('todas', 'Activas', activas.length)}
        {segmento('sin', 'Sin autorización', sinAutorizacion.length)}
        {segmento('inactivas', 'Inactivas', d.personas.length - activas.length)}
      </nav>

      {lista.length === 0 ? (
        <Vacio icono={UsersRound} texto={d.personas.length === 0 ? 'Todavía no hay personas registradas.' : 'Ninguna persona coincide.'}>
          {permisos.crear && d.personas.length === 0 && <FilaAgregar href={`${base}${sep}nueva=1`} texto="Agregar persona" />}
        </Vacio>
      ) : (
        <>
          <Filas etiqueta="Personas">
            {lista.map((p) => (
              <Fila
                key={p.id}
                titulo={p.nombre}
                meta={resumenVinculos(p.id)}
                punto={p.activa ? puntoAutorizacion(estadoAutorizacion(autorizacionesDe(p.id))) : null}
                href={`${base}${sep}p=${p.id}`}
                actual={p.id === seleccion}
                inactiva={!p.activa}
              />
            ))}
          </Filas>
          {permisos.crear && <FilaAgregar href={`${base}${sep}nueva=1`} texto="Agregar persona" />}
        </>
      )}

      {nueva && permisos.crear && (
        <PanelLateral titulo="Agregar persona" meta="Regístrala una vez; luego vincúlala a sus unidades." cerrar={base}>
          <FormularioPersona copro={copro} verDatos={permisos.verDatos} regreso={base} />
        </PanelLateral>
      )}
      {seleccionada && (
        <PanelPersona
          copro={copro}
          persona={seleccionada}
          datos={d.datos.get(seleccionada.id)}
          vinculos={vinculosDe(seleccionada.id)}
          autorizaciones={autorizacionesDe(seleccionada.id)}
          politicas={d.politicas}
          nombreUnidad={nombreU}
          unidadesParaVincular={unidadesActivas}
          permisos={permisos}
          base={base}
          editando={editando}
        />
      )}
    </>
  )
}
