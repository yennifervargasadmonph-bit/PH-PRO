'use client'
import { useActionState, useState } from 'react'
import { ROLES_COPROPIEDAD } from '@/lib/roles'
import { asignarAcceso, invitarPersona, type Estado } from './acciones'

function Mensajes({ estado }: { estado: Estado }) {
  if (estado.error) return <p className="aviso error" role="alert">{estado.error}</p>
  if (estado.ok) return <p className="aviso ok" role="status">{estado.ok}</p>
  return null
}

function EnlaceCopiable({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }
  return (
    <div className="campos" style={{ gap: 6 }}>
      <span className="pequeno">
        Envía este enlace a la persona (por correo o WhatsApp). Funciona una sola vez, durante 7 días y solo con la cuenta de ese correo.
        No lo volverás a ver: si se pierde, invita de nuevo.
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <input readOnly value={enlace} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" style={{ flex: 1, minWidth: 0 }} />
        <button type="button" className="boton secundario" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button>
      </div>
    </div>
  )
}

export function FormularioInvitacion({ organizacionId, copropiedades }: { organizacionId: string; copropiedades: { id: string; nombre: string }[] }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(invitarPersona.bind(null, organizacionId), {})
  const [rol, setRol] = useState('miembro')
  return (
    <form className="campos" action={accion}>
      <div className="fila">
        <label>Correo<input name="correo" type="email" autoComplete="off" required /></label>
        <label>
          Rol en la organización
          <select name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="miembro">Miembro (ve solo las copropiedades asignadas)</option>
            <option value="administrador">Administrador (ve y gestiona todas)</option>
          </select>
        </label>
      </div>
      {rol === 'miembro' && (
        <div className="fila">
          <label>
            Copropiedad <small>(opcional)</small>
            <select name="copropiedad_id" defaultValue="">
              <option value="">Ninguna por ahora</option>
              {copropiedades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label>
            Rol en la copropiedad
            <select name="rol_copropiedad" defaultValue="auxiliar">
              {Object.entries(ROLES_COPROPIEDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
        </div>
      )}
      <Mensajes estado={estado} />
      {estado.enlace && <EnlaceCopiable enlace={estado.enlace} />}
      <div><button className="boton" disabled={enviando}>{enviando ? 'Creando…' : 'Crear invitación'}</button></div>
    </form>
  )
}

export function FormularioAcceso({ personas, copropiedades }: { personas: { id: string; nombre: string }[]; copropiedades: { id: string; nombre: string }[] }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(asignarAcceso, {})
  return (
    <form className="campos" action={accion}>
      <div className="fila">
        <label>Persona<select name="usuario_id" required defaultValue="">{[<option key="" value="" disabled>Elige…</option>, ...personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)]}</select></label>
        <label>Copropiedad<select name="copropiedad_id" required defaultValue="">{[<option key="" value="" disabled>Elige…</option>, ...copropiedades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)]}</select></label>
        <label>Rol<select name="rol" defaultValue="auxiliar">{Object.entries(ROLES_COPROPIEDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      </div>
      <Mensajes estado={estado} />
      <div><button className="boton" disabled={enviando}>Asignar acceso</button></div>
    </form>
  )
}
