'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { recuperar, type EstadoFormulario } from '../ingresar/acciones'

export function FormularioRecuperar() {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(recuperar, {})
  return (
    <form className="campos" action={accion}>
      <label>
        Correo
        <input name="correo" type="email" autoComplete="username" required />
      </label>
      {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
      {estado.ok && <p className="aviso ok" role="status">{estado.ok}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
      <p className="pequeno" style={{ textAlign: 'center', margin: 0 }}>
        <Link href="/ingresar">Volver a ingresar</Link>
      </p>
    </form>
  )
}
