import Link from 'next/link'
import { History, UsersRound } from 'lucide-react'
import { Cabecera } from '@/components/ui/cabecera'
import { Cifras } from '@/components/ui/cifras'
import { Faltante } from '@/components/ui/faltante'
import { Fila, FilaAgregar, Filas } from '@/components/ui/filas'
import { PanelLateral } from '@/components/ui/panel-lateral'
import { Vacio } from '@/components/ui/vacio'
import { TIPOS_UNIDAD } from '@/lib/importacion/unidades'
import {
  CANALES,
  TEXTO_AUTORIZACION,
  TIPOS_VINCULO,
  estadoAutorizacion,
  fechaCorta,
  periodo,
  puntoAutorizacion,
  vinculoVigente,
  type TipoVinculo,
  type Vinculo,
} from '@/lib/personas'
import type { DatosPersonas } from '@/lib/personas-servidor'
import { nombreUnidad, type Unidad } from '@/lib/unidades'
import { FormularioVincular } from '../../personas/formularios'
import { PanelPersona, type PermisosPersonas } from '../../personas/panel-persona'

export type EventoHistorial = { creado_en: string; accion: string; entidad: string; tipo: string | null; cambios: string[]; autor: string | null }

const CAMPOS_UNIDAD: Record<string, string> = {
  coeficiente: 'coeficiente',
  area_m2: 'área',
  matricula_inmobiliaria: 'matrícula',
  tipo: 'tipo',
  activa: 'estado',
  torre: 'torre',
  numero: 'número',
}

const numero = (v: string | number | null, d = 6) => (v === null ? null : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d }))

/** Texto de un evento de la bitácora para el historial de la unidad. */
export function textoEvento(e: EventoHistorial) {
  const tipo = e.tipo && e.tipo in TIPOS_VINCULO ? TIPOS_VINCULO[e.tipo as TipoVinculo].toLowerCase() : 'persona'
  if (e.entidad === 'unidades') {
    if (e.accion === 'insert') return 'Unidad creada'
    const campos = e.cambios.map((c) => CAMPOS_UNIDAD[c]).filter(Boolean)
    return campos.length ? `Unidad modificada: ${campos.join(', ')}` : 'Unidad modificada'
  }
  if (e.accion === 'insert') return `Se vinculó: ${tipo}`
  if (e.cambios.includes('hasta')) return `Terminó un vínculo: ${tipo}`
  return `Se actualizó un vínculo: ${tipo}`
}

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })

export function VistaExpediente({
  copro,
  unidad,
  d,
  historial,
  permisos,
  editarUnidad,
  seleccion,
  editando,
  vinculando,
}: {
  copro: string
  unidad: Unidad
  d: DatosPersonas
  historial: EventoHistorial[]
  permisos: PermisosPersonas
  editarUnidad: boolean
  seleccion?: string
  editando: boolean
  vinculando: boolean
}) {
  const ruta = `/c/${copro}/unidades/${unidad.id}`
  const nombre = nombreUnidad(unidad)
  const persona = new Map(d.personas.map((p) => [p.id, p]))
  const propios = d.vinculos.filter((v) => v.unidad_id === unidad.id)
  const actuales = propios.filter((v) => vinculoVigente(v)).sort((a, b) => Number(b.es_titular) - Number(a.es_titular))
  const anteriores = propios.filter((v) => !vinculoVigente(v)).sort((a, b) => (b.hasta ?? '').localeCompare(a.hasta ?? ''))
  const titular = actuales.find((v) => v.es_titular)
  const autorizacionesDe = (id: string) => d.autorizaciones.filter((a) => a.persona_id === id)
  const personasActuales = [...new Set(actuales.map((v) => v.persona_id))]
  const conAutorizacion = personasActuales.filter((id) => estadoAutorizacion(autorizacionesDe(id)) === 'vigente').length
  const version = new Map(d.politicas.map((p) => [p.id, p.version]))
  const nombreU = new Map(d.unidades.map((u) => [u.id, nombreUnidad(u)]))

  const fila = (v: Vinculo) => {
    const p = persona.get(v.persona_id)
    return (
      <Fila
        key={v.id}
        titulo={p?.nombre ?? 'Persona'}
        meta={[TIPOS_VINCULO[v.tipo], v.es_titular && 'titular', v.reside && 'vive aquí', periodo(v)].filter(Boolean).join(' · ')}
        punto={vinculoVigente(v) && p?.activa ? puntoAutorizacion(estadoAutorizacion(autorizacionesDe(v.persona_id))) : null}
        href={`${ruta}?p=${v.persona_id}`}
        actual={v.persona_id === seleccion}
        inactiva={!vinculoVigente(v)}
      />
    )
  }
  const seleccionada = seleccion ? persona.get(seleccion) : undefined

  return (
    <>
      <Cabecera
        titulo={nombre}
        meta={[TIPOS_UNIDAD[unidad.tipo], unidad.matricula_inmobiliaria ? `Matrícula ${unidad.matricula_inmobiliaria}` : null, unidad.activa ? 'Activa' : 'Inactiva'].filter(Boolean).join(' · ')}
        accion={permisos.crear ? <Link className="boton" href={`${ruta}?vincular=1`} scroll={false}>Vincular persona</Link> : undefined}
        mas={[
          ...(editarUnidad ? [{ href: `/c/${copro}/unidades?editar=${unidad.id}`, texto: 'Editar unidad' }] : []),
          { href: `/c/${copro}/unidades`, texto: 'Todas las unidades' },
          { href: `/c/${copro}/personas`, texto: 'Todas las personas' },
        ]}
      />

      <Cifras
        cifras={[
          { etiqueta: 'Coeficiente', valor: `${numero(unidad.coeficiente)} %` },
          { etiqueta: 'Área', valor: unidad.area_m2 ? `${numero(unidad.area_m2, 2)} m²` : <Faltante />, nota: unidad.area_m2 ? 'Área privada' : undefined },
          {
            etiqueta: 'Titular',
            valor: titular ? persona.get(titular.persona_id)?.nombre ?? '—' : <Faltante />,
            nota: titular ? fechaCorta(titular.desde) ? `Desde ${fechaCorta(titular.desde)}` : 'Desde: dato faltante' : 'Sin titular registrado',
            punto: titular ? undefined : 'ambar',
          },
          {
            etiqueta: 'Autorizaciones',
            valor: `${conAutorizacion} de ${personasActuales.length}`,
            nota: personasActuales.length && conAutorizacion < personasActuales.length ? 'Faltan autorizaciones' : 'Personas actuales',
            punto: personasActuales.length && conAutorizacion < personasActuales.length ? 'ambar' : undefined,
          },
        ]}
      />

      <div className="dos-columnas">
        <div>
          <section>
            <div className="seccion-cabeza"><h2>Personas actuales</h2><span className="meta">{actuales.length}</span></div>
            {actuales.length === 0 ? (
              <Vacio icono={UsersRound} texto="Nadie vinculado a esta unidad todavía.">
                {permisos.crear && <FilaAgregar href={`${ruta}?vincular=1`} texto="Vincular persona" />}
              </Vacio>
            ) : (
              <>
                <Filas etiqueta="Personas actuales">{actuales.map(fila)}</Filas>
                {permisos.crear && <FilaAgregar href={`${ruta}?vincular=1`} texto="Vincular persona" />}
              </>
            )}
          </section>

          {anteriores.length > 0 && (
            <section className="seccion">
              <div className="seccion-cabeza"><h2>Personas anteriores</h2><span className="meta">{anteriores.length}</span></div>
              <Filas etiqueta="Personas anteriores">{anteriores.map(fila)}</Filas>
            </section>
          )}

          <section className="seccion">
            <div className="seccion-cabeza"><h2>Autorizaciones</h2><span className="meta">Ley 1581 de 2012</span></div>
            {personasActuales.length === 0 ? (
              <p className="meta">Sin personas actuales.</p>
            ) : (
              <Filas etiqueta="Autorizaciones de datos">
                {personasActuales.map((id) => {
                  const auts = autorizacionesDe(id)
                  const estado = estadoAutorizacion(auts)
                  const ultima = auts.find((a) => !a.revocada_en) ?? auts[0]
                  return (
                    <Fila
                      key={id}
                      titulo={persona.get(id)?.nombre ?? 'Persona'}
                      meta={
                        ultima
                          ? estado === 'vigente'
                            ? `Versión ${version.get(ultima.politica_id) ?? '—'} · ${CANALES[ultima.canal]} · ${fechaCorta(ultima.otorgada_en)}`
                            : `Revocada el ${fechaCorta(ultima.revocada_en)}`
                          : TEXTO_AUTORIZACION.sin
                      }
                      punto={puntoAutorizacion(estado)}
                      href={`${ruta}?p=${id}`}
                    />
                  )
                })}
              </Filas>
            )}
          </section>
        </div>

        <section>
          <div className="seccion-cabeza"><h2>Historial</h2><span className="meta">Desde la bitácora</span></div>
          {historial.length === 0 ? (
            <Vacio icono={History} texto="Sin movimientos registrados." />
          ) : (
            <Filas etiqueta="Historial de la unidad">
              {historial.map((e, i) => (
                <Fila key={`${e.creado_en}-${i}`} titulo={textoEvento(e)} meta={`${fechaHora(e.creado_en)}${e.autor ? ` · ${e.autor}` : ''}`} />
              ))}
            </Filas>
          )}
        </section>
      </div>

      {vinculando && permisos.crear && (
        <PanelLateral titulo="Vincular persona" meta={`A la unidad ${nombre}`} cerrar={ruta}>
          <FormularioVincular
            copro={copro}
            unidadId={unidad.id}
            personas={d.personas.filter((p) => p.activa).map((p) => ({ id: p.id, nombre: p.nombre }))}
            verDatos={permisos.verDatos}
            puedeRegistrar={permisos.crear}
            regreso={ruta}
          />
        </PanelLateral>
      )}
      {seleccionada && (
        <PanelPersona
          copro={copro}
          persona={seleccionada}
          datos={d.datos.get(seleccionada.id)}
          vinculos={d.vinculos.filter((v) => v.persona_id === seleccionada.id)}
          autorizaciones={autorizacionesDe(seleccionada.id)}
          politicas={d.politicas}
          nombreUnidad={nombreU}
          unidadesParaVincular={d.unidades.filter((u) => u.activa).map((u) => ({ id: u.id, nombre: nombreUnidad(u) }))}
          permisos={permisos}
          base={ruta}
          editando={editando}
        />
      )}
    </>
  )
}
