'use client'
import { useActionState } from 'react'
import { ROLES_COPROPIEDAD } from '@/lib/roles'
import { agregarMiembro, asignarAcceso, type Estado } from './acciones'

function Mensajes({ estado }: { estado: Estado }) {
  if (estado.error) return <p className="aviso error" role="alert">{estado.error}</p>
  if (estado.ok) return <p className="aviso ok" role="status">{estado.ok}</p>
  return null
}

export function FormularioMiembro({ organizacionId }: { organizacionId: string }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(agregarMiembro.bind(null, organizacionId), {})
  return (
    <form className="campos" action={accion}>
      <div className="fila">
        <label>Correo<input name="correo" type="email" required /></label>
        <label>
          Rol en la organización
          <select name="rol" defaultValue="miembro">
            <option value="miembro">Miembro (ve solo las copropiedades asignadas)</option>
            <option value="administrador">Administrador (ve y gestiona todas)</option>
          </select>
        </label>
      </div>
      <Mensajes estado={estado} />
      <div><button className="boton" disabled={enviando}>Agregar al equipo</button></div>
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
