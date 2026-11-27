import Link from 'next/link'
import { PanelLateral } from '@/components/ui/panel-lateral'
import { Fila, Filas } from '@/components/ui/filas'
import { Faltante, Valor } from '@/components/ui/faltante'
import {
  CANALES,
  FINALIDADES,
  TEXTO_AUTORIZACION,
  TIPOS_DOCUMENTO,
  TIPOS_VINCULO,
  estadoAutorizacion,
  fechaCorta,
  formatearTelefono,
  periodo,
  puntoAutorizacion,
  vinculoVigente,
  type Autorizacion,
  type DatosPersona,
  type Persona,
  type Politica,
  type Vinculo,
} from '@/lib/personas'
import { cambiarEstadoPersona } from './acciones'
import { FormularioAutorizacion, FormularioPersona, FormularioRevocar, FormularioTerminar, FormularioVincular } from './formularios'

export type PermisosPersonas = {
  verDatos: boolean
  crear: boolean
  editar: boolean
  inactivar: boolean
  aprobar: boolean
  verUnidades: boolean
}

/** Detalle de una persona en el panel lateral: datos, unidades, autorización y conservación. */
export function PanelPersona({
  copro,
  persona,
  datos,
  vinculos,
  autorizaciones,
  politicas,
  nombreUnidad,
  unidadesParaVincular,
  permisos,
  base,
  editando,
}: {
  copro: string
  persona: Persona
  datos?: DatosPersona
  vinculos: Vinculo[]
  autorizaciones: Autorizacion[]
  politicas: Pick<Politica, 'id' | 'version'>[]
  nombreUnidad: Map<string, string>
  unidadesParaVincular: { id: string; nombre: string }[]
  permisos: PermisosPersonas
  /** URL de la pantalla sin el panel (para cerrar). */
  base: string
  editando: boolean
}) {
  const sep = base.includes('?') ? '&' : '?'
  const enlace = `${base}${sep}p=${persona.id}`
  const estado = estadoAutorizacion(autorizaciones)
  const punto = puntoAutorizacion(estado)
  const vigentes = vinculos.filter((v) => vinculoVigente(v))
  const anteriores = vinculos.filter((v) => !vinculoVigente(v))
  const version = new Map(politicas.map((p) => [p.id, p.version]))

  const filaVinculo = (v: Vinculo) => (
    <Fila
      key={v.id}
      titulo={nombreUnidad.get(v.unidad_id) ?? 'Unidad'}
      meta={[TIPOS_VINCULO[v.tipo], v.es_titular && 'titular', v.reside && 'vive aquí', periodo(v)].filter(Boolean).join(' · ')}
      href={permisos.verUnidades ? `/c/${copro}/unidades/${v.unidad_id}` : undefined}
      inactiva={!vinculoVigente(v)}
    />
  )

  return (
    <PanelLateral
      titulo={persona.nombre}
      meta={`Persona ${persona.tipo_persona === 'juridica' ? 'jurídica' : 'natural'} · ${persona.activa ? 'Activa' : 'Inactiva'}`}
      cerrar={base}
    >
      <section className="bloque">
        <div className="bloque-cabeza">
          <h3>Datos</h3>
          {permisos.editar && !editando && <Link className="boton fantasma pequeno" href={`${enlace}&editar=1`} scroll={false}>Editar</Link>}
        </div>
        {editando && permisos.editar ? (
          <FormularioPersona copro={copro} persona={persona} datos={datos} verDatos={permisos.verDatos} />
        ) : permisos.verDatos ? (
          <dl className="datos">
            <dt>Documento</dt>
            <dd>{datos?.numero_documento ? `${TIPOS_DOCUMENTO[datos.tipo_documento ?? 'otro']} ${datos.numero_documento}` : <Faltante />}</dd>
            <dt>Correo</dt><dd><Valor v={datos?.correo} /></dd>
            <dt>Celular</dt><dd><Valor v={datos?.celular && formatearTelefono(datos.celular)} /></dd>
            <dt>Teléfono</dt><dd><Valor v={datos?.telefono} /></dd>
          </dl>
        ) : (
          <p className="caja-suave meta" style={{ margin: 0 }}>Documento y contacto reservados para la administración (Ley 1581 de 2012).</p>
        )}
      </section>

      <section className="bloque">
        <h3>Unidades</h3>
        {vinculos.length === 0 ? (
          <p className="meta" style={{ margin: 0 }}>Sin unidades vinculadas.</p>
        ) : (
          <Filas etiqueta="Unidades de la persona">
            {vigentes.map(filaVinculo)}
            {anteriores.map(filaVinculo)}
          </Filas>
        )}
        {permisos.editar && vigentes.length > 0 && (
          <details className="caja-suave">
            <summary className="meta" style={{ cursor: 'pointer', fontWeight: 600 }}>Terminar un vínculo</summary>
            <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
              {vigentes.map((v) => (
                <div key={v.id} className="bloque">
                  <strong>{nombreUnidad.get(v.unidad_id)} · {TIPOS_VINCULO[v.tipo]}</strong>
                  <FormularioTerminar copro={copro} vinculoId={v.id} />
                </div>
              ))}
            </div>
          </details>
        )}
        {permisos.crear && (
          <details className="caja-suave">
            <summary className="meta" style={{ cursor: 'pointer', fontWeight: 600 }}>Vincular a otra unidad</summary>
            <div style={{ marginTop: 10 }}>
              <FormularioVincular copro={copro} personaId={persona.id} unidades={unidadesParaVincular} verDatos={permisos.verDatos} puedeRegistrar={false} regreso={enlace} />
            </div>
          </details>
        )}
      </section>

      <section className="bloque">
        <div className="bloque-cabeza">
          <h3>Autorización de datos</h3>
          <span className="estado meta">
            {punto && <span className={`punto ${punto}`} aria-hidden="true" />}
            {TEXTO_AUTORIZACION[estado]}
          </span>
        </div>
        {autorizaciones.length > 0 && (
          <Filas etiqueta="Autorizaciones">
            {autorizaciones.map((a) => (
              <Fila
                key={a.id}
                titulo={`Versión ${version.get(a.politica_id) ?? '—'} · ${fechaCorta(a.otorgada_en)}`}
                meta={
                  a.revocada_en
                    ? `Revocada el ${fechaCorta(a.revocada_en)} · ${CANALES[a.revocacion_canal ?? 'escrito']}`
                    : `${CANALES[a.canal]} · ${a.finalidades.map((f) => FINALIDADES[f].split(' (')[0]).join(', ')}`
                }
                punto={a.revocada_en ? 'rojo' : null}
              />
            ))}
          </Filas>
        )}
        {permisos.editar && autorizaciones.filter((a) => !a.revocada_en).map((a) => (
          <details className="caja-suave" key={a.id}>
            <summary className="meta" style={{ cursor: 'pointer', fontWeight: 600 }}>Registrar revocación (versión {version.get(a.politica_id)})</summary>
            <div style={{ marginTop: 10 }}><FormularioRevocar copro={copro} autorizacionId={a.id} /></div>
          </details>
        ))}
        {permisos.crear &&
          (politicas.length ? (
            <details className="caja-suave" open={estado === 'sin'}>
              <summary className="meta" style={{ cursor: 'pointer', fontWeight: 600 }}>Registrar autorización</summary>
              <div style={{ marginTop: 10 }}><FormularioAutorizacion copro={copro} personaId={persona.id} politicas={politicas} /></div>
            </details>
          ) : (
            <p className="aviso info">
              Para registrar autorizaciones primero se publica la política de tratamiento.{' '}
              {permisos.aprobar ? <Link href={`/c/${copro}/personas/politica?nueva=1`}>Publicar política</Link> : 'La administración debe publicarla.'}
            </p>
          ))}
      </section>

      <section className="bloque">
        <h3>Conservación</h3>
        <p style={{ margin: 0 }}>
          {vinculos.some((v) => !v.hasta) ? (
            'Mientras tenga vínculos abiertos.'
          ) : persona.conservar_hasta ? (
            <>Conservar los datos hasta el <strong>{fechaCorta(persona.conservar_hasta)}</strong>.</>
          ) : vinculos.length ? (
            <>Hasta: <Faltante /> <span className="meta">(falta la política con el plazo)</span></>
          ) : (
            'Sin vínculos: el plazo empieza cuando termine su último vínculo.'
          )}
        </p>
      </section>

      {permisos.inactivar && (
        <form action={cambiarEstadoPersona.bind(null, copro, persona.id, !persona.activa)}>
          <button className="boton secundario">{persona.activa ? 'Inactivar persona' : 'Reactivar persona'}</button>
        </form>
      )}
    </PanelLateral>
  )
}
