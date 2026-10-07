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
          Nombre
          <input name="nombre" required placeholder="Ej.: Edificio Álamos 23" onChange={(e) => !tocado && setPrefijo(sugerirPrefijo(e.target.value))} />
        </label>
        <label>
          Tipo
          <select name="tipo" defaultValue="edificio">
            {Object.entries(TIPOS_COPROPIEDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="fila">
        <label>NIT <small>(opcional)</small><input name="nit" placeholder="900123456-8" /></label>
        <label>
          Prefijo documental <small>(2 a 6 caracteres)</small>
          <input name="prefijo" required value={prefijo} onChange={(e) => { setTocado(true); setPrefijo(e.target.value.toUpperCase()) }} />
        </label>
      </div>
      <div className="fila">
        <label>Ciudad<input name="ciudad" placeholder="Bogotá D.C." /></label>
        <label>Dirección<input name="direccion" /></label>
      </div>
      <Mensajes estado={estado} />
      <div><button className="boton" disabled={enviando}>{enviando ? 'Creando…' : 'Crear copropiedad'}</button></div>
    </form>
  )
}
