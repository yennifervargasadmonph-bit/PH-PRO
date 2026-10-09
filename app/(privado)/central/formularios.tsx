'use client'
import { useActionState, useState } from 'react'
import { TIPOS_COPROPIEDAD, sugerirPrefijo } from '@/lib/validacion'
import { crearCopropiedad, crearOrganizacion, type Estado } from './acciones'

function Mensajes({ estado }: { estado: Estado }) {
  if (estado.error) return <p className="aviso error" role="alert">{estado.error}</p>
  if (estado.ok) return <p className="aviso ok" role="status">{estado.ok}</p>
  return null
}

export function FormularioOrganizacion() {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(crearOrganizacion, {})
  return (
    <form className="campos" action={accion}>
      <div className="fila">
        <label>Nombre de la organización<input name="nombre" required placeholder="Ej.: Vargas Administración PH" /></label>
        <label>NIT <small>(opcional)</small><input name="nit" placeholder="900123456-8" /></label>
      </div>
      <Mensajes estado={estado} />
      <div><button className="boton" disabled={enviando}>{enviando ? 'Creando…' : 'Crear organización'}</button></div>
    </form>
  )
}

export function FormularioCopropiedad({ organizacionId }: { organizacionId: string }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(crearCopropiedad, {})
  const [prefijo, setPrefijo] = useState('')
  const [tocado, setTocado] = useState(false)
  return (
    <form className="campos" action={accion}>
      <input type="hidden" name="organizacion_id" value={organizacionId} />
      <div className="fila">
        <label>
          Nombre corto <small>(el de los menús)</small>
          <input name="nombre" required placeholder="Ej.: Edificio Álamos 23" onChange={(e) => !tocado && setPrefijo(sugerirPrefijo(e.target.value))} />
        </label>
        <label>
          Tipo
          <select name="tipo" defaultValue="edificio">
            {Object.entries(TIPOS_COPROPIEDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="campos" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 4 }}>Identidad del edificio</legend>
        <p className="tenue pequeno" style={{ margin: 0 }}>Con estos datos se preparan todos los documentos. El logo se carga después, en Identidad del edificio.</p>
        <label>
          Nombre completo
          <input name="nombre_legal" required minLength={5} maxLength={160} placeholder="Ej.: Edificio Álamos 23 Propiedad Horizontal" />
          <small>Tal como figura en la certificación de existencia y representación legal.</small>
        </label>
        <div className="fila">
          <label>NIT<input name="nit" required inputMode="numeric" placeholder="900123456-8" /></label>
          <label>Celular de la administración<input name="celular" required type="tel" inputMode="tel" placeholder="300 123 4567" /></label>
        </div>
      </fieldset>
      <div className="fila">
        <label>
          Prefijo documental <small>(2 a 6 caracteres)</small>
          <input name="prefijo" required value={prefijo} onChange={(e) => { setTocado(true); setPrefijo(e.target.value.toUpperCase()) }} />
        </label>
        <label>Ciudad<input name="ciudad" placeholder="Bogotá D.C." /></label>
      </div>
      <label>Dirección<input name="direccion" /></label>
      <Mensajes estado={estado} />
      <div><button className="boton" disabled={enviando}>{enviando ? 'Creando…' : 'Crear copropiedad'}</button></div>
    </form>
  )
}
