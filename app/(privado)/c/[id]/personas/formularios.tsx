'use client'
import { useActionState, useState } from 'react'
import { CANALES, FINALIDADES, TIPOS_DOCUMENTO, TIPOS_VINCULO, hoyColombia, type DatosPersona, type Persona, type Politica } from '@/lib/personas'
import {
  editarPersona,
  publicarPolitica,
  registrarAutorizacion,
  registrarPersona,
  revocarAutorizacion,
  terminarVinculo,
  vincular,
  type Estado,
} from './acciones'

function Mensajes({ estado }: { estado: Estado }) {
  if (estado.error) return <p className="aviso error" role="alert">{estado.error}</p>
  if (estado.ok) return <p className="aviso ok" role="status">{estado.ok}</p>
  return null
}

function Enviar({ enviando, texto, secundario }: { enviando: boolean; texto: string; secundario?: boolean }) {
  return (
    <div>
      <button className={secundario ? 'boton secundario' : 'boton'} disabled={enviando}>{enviando ? 'Guardando…' : texto}</button>
    </div>
  )
}

/** Nombre y, si la persona puede verlos, documento y contacto. */
function CamposPersona({ persona, datos, verDatos }: { persona?: Persona; datos?: DatosPersona; verDatos: boolean }) {
  return (
    <>
      <div className="fila">
        <label>
          Nombre completo o razón social
          <input name="nombre" defaultValue={persona?.nombre} required minLength={2} maxLength={160} autoComplete="off" />
        </label>
        <label>
          Tipo de persona
          <select name="tipo_persona" defaultValue={persona?.tipo_persona ?? 'natural'}>
            <option value="natural">Natural</option>
            <option value="juridica">Jurídica</option>
          </select>
        </label>
      </div>
      {verDatos && (
        <>
          <div className="fila">
            <label>
              Tipo de documento <small>(opcional)</small>
              <select name="tipo_documento" defaultValue={datos?.tipo_documento ?? ''}>
                <option value="">Sin documento</option>
                {Object.entries(TIPOS_DOCUMENTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label>Número <small>(opcional)</small><input name="numero_documento" defaultValue={datos?.numero_documento ?? ''} maxLength={30} inputMode="text" autoComplete="off" /></label>
          </div>
          <div className="fila">
            <label>Correo <small>(opcional)</small><input name="correo" type="email" defaultValue={datos?.correo ?? ''} maxLength={160} autoComplete="off" /></label>
            <label>Celular <small>(opcional)</small><input name="celular" type="tel" inputMode="tel" defaultValue={datos?.celular ?? ''} placeholder="300 123 4567" autoComplete="off" /></label>
            <label>Teléfono fijo <small>(opcional)</small><input name="telefono" type="tel" inputMode="tel" defaultValue={datos?.telefono ?? ''} autoComplete="off" /></label>
          </div>
        </>
      )}
    </>
  )
}

export function FormularioPersona({ copro, persona, datos, verDatos, regreso }: { copro: string; persona?: Persona; datos?: DatosPersona; verDatos: boolean; regreso?: string }) {
  const accion = persona ? editarPersona.bind(null, copro, persona.id, verDatos) : registrarPersona.bind(null, copro)
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(accion, {})
  return (
    <form className="campos" action={enviar}>
      {regreso && <input type="hidden" name="regreso" value={regreso} />}
      <CamposPersona persona={persona} datos={datos} verDatos={verDatos} />
      {!verDatos && <p className="meta">El documento y los datos de contacto los registra la administración.</p>}
      <Mensajes estado={estado} />
      <Enviar enviando={enviando} texto={persona ? 'Guardar cambios' : 'Registrar persona'} />
    </form>
  )
}

function CamposVinculo() {
  const [tipo, setTipo] = useState('propietario')
  return (
    <>
      <div className="fila">
        <label>
          Vínculo
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPOS_VINCULO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label>Desde <small>(si no se sabe, déjalo vacío)</small><input name="desde" type="date" max={hoyColombia()} /></label>
        <label>Hasta <small>(opcional)</small><input name="hasta" type="date" /></label>
      </div>
      <div>
        {tipo === 'propietario' && <label className="casilla"><input type="checkbox" name="es_titular" /> Es el titular de la unidad</label>}
        <label className="casilla"><input type="checkbox" name="reside" defaultChecked={tipo === 'residente' || tipo === 'arrendatario'} key={tipo} /> Vive en la unidad (lo ve portería)</label>
      </div>
    </>
  )
}

/** Vincular: desde la unidad (elige persona) o desde la persona (elige unidad). */
export function FormularioVincular({
  copro,
  unidadId,
  personaId,
  personas = [],
  unidades = [],
  verDatos,
  puedeRegistrar,
  regreso,
}: {
  copro: string
  unidadId?: string
  personaId?: string
  personas?: { id: string; nombre: string }[]
  unidades?: { id: string; nombre: string }[]
  verDatos: boolean
  puedeRegistrar: boolean
  regreso: string
}) {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(vincular.bind(null, copro, unidadId ?? null, personaId ?? null), {})
  const [eleccion, setEleccion] = useState(personas.length ? '' : 'nueva')
  return (
    <form className="campos" action={enviar}>
      <input type="hidden" name="regreso" value={regreso} />
      {!unidadId && (
        <label>
          Unidad
          <select name="unidad_id" required defaultValue="">
            <option value="" disabled>Elige la unidad</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
      )}
      {!personaId && (
        <label>
          Persona
          <select name="persona_id" required value={eleccion} onChange={(e) => setEleccion(e.target.value)}>
            <option value="" disabled>Elige una persona ya registrada</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            {puedeRegistrar && <option value="nueva">+ Registrar una persona nueva</option>}
          </select>
          <small>Registra cada persona una sola vez y vincúlala a todas sus unidades.</small>
        </label>
      )}
      {eleccion === 'nueva' && !personaId && (
        <fieldset className="campos caja-suave">
          <legend>Persona nueva</legend>
          <CamposPersona verDatos={verDatos} />
        </fieldset>
      )}
      <CamposVinculo />
      <Mensajes estado={estado} />
      <Enviar enviando={enviando} texto="Vincular" />
    </form>
  )
}

export function FormularioTerminar({ copro, vinculoId }: { copro: string; vinculoId: string }) {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(terminarVinculo.bind(null, copro, vinculoId), {})
  return (
    <form className="campos" action={enviar}>
      <label>Fecha de fin<input name="hasta" type="date" required defaultValue={hoyColombia()} /></label>
      <Mensajes estado={estado} />
      <Enviar enviando={enviando} texto="Terminar vínculo" secundario />
    </form>
  )
}

export function FormularioAutorizacion({ copro, personaId, politicas }: { copro: string; personaId: string; politicas: Pick<Politica, 'id' | 'version'>[] }) {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(registrarAutorizacion.bind(null, copro, personaId), {})
  return (
    <form className="campos" action={enviar}>
      <div className="fila">
        <label>
          Versión de la política
          <select name="politica_id" defaultValue={politicas[0]?.id} required>
            {politicas.map((p) => <option key={p.id} value={p.id}>Versión {p.version}</option>)}
          </select>
        </label>
        <label>
          Canal
          <select name="canal" required defaultValue="">
            <option value="" disabled>Cómo la dio</option>
            {Object.entries(CANALES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label>Fecha<input name="otorgada_en" type="date" required max={hoyColombia()} /></label>
      </div>
      <fieldset>
        <legend>Finalidades autorizadas</legend>
        {Object.entries(FINALIDADES).map(([v, t]) => (
          <label className="casilla" key={v}><input type="checkbox" name="finalidades" value={v} /> {t}</label>
        ))}
      </fieldset>
      <p className="meta">Quedará registrado quién la registró y cuándo.</p>
      <Mensajes estado={estado} />
      <Enviar enviando={enviando} texto="Registrar autorización" />
    </form>
  )
}

export function FormularioRevocar({ copro, autorizacionId }: { copro: string; autorizacionId: string }) {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(revocarAutorizacion.bind(null, copro, autorizacionId), {})
  return (
    <form className="campos" action={enviar}>
      <div className="fila">
        <label>Fecha de la revocación<input name="revocada_en" type="date" required max={hoyColombia()} /></label>
        <label>
          Canal
          <select name="revocacion_canal" required defaultValue="">
            <option value="" disabled>Cómo la revocó</option>
            {Object.entries(CANALES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>
      <p className="meta">La revocación no se puede deshacer. Si la persona vuelve a autorizar, registra una autorización nueva.</p>
      <Mensajes estado={estado} />
      <Enviar enviando={enviando} texto="Registrar revocación" secundario />
    </form>
  )
}

export function FormularioPolitica({ copro }: { copro: string }) {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(publicarPolitica.bind(null, copro), {})
  return (
    <form className="campos" action={enviar}>
      <div className="fila">
        <label>Versión<input name="version" required maxLength={20} placeholder="1.0" /></label>
        <label>Rige desde<input name="vigente_desde" type="date" required /></label>
        <label>
          Conservar los datos
          <input name="meses_conservacion" type="number" min={1} max={600} required inputMode="numeric" />
          <small>Meses después de terminar el último vínculo.</small>
        </label>
      </div>
      <label>
        Texto de la política
        <textarea name="texto" required minLength={50} maxLength={50000} />
        <small>Pega el texto aprobado tal como se entrega a las personas. Una versión publicada no se edita.</small>
      </label>
      <Mensajes estado={estado} />
      <Enviar enviando={enviando} texto="Publicar versión" />
    </form>
  )
}
