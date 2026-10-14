'use client'
import { useActionState } from 'react'
import { aceptarInvitacion, type Estado } from './acciones'

export function FormularioAceptar({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(aceptarInvitacion.bind(null, token), {})
  return (
    <form className="campos" action={accion}>
      {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Aceptando…' : 'Aceptar invitación'}</button>
    </form>
  )
}
