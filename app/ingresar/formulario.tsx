'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { ingresar, type EstadoFormulario } from './acciones'

export function FormularioIngreso({ siguiente }: { siguiente?: string }) {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(ingresar, {})
  return (
    <form className="campos" action={accion}>
      <input type="hidden" name="siguiente" value={siguiente ?? ''} />
      <label>
        Correo
        <input name="correo" type="email" autoComplete="username" required />
      </label>
      <label>
        Contraseña
        <input name="clave" type="password" autoComplete="current-password" required />
      </label>
      {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
      <p className="pequeno" style={{ textAlign: 'center', margin: 0 }}>
        <Link href="/recuperar">Olvidé mi contraseña</Link>
      </p>
    </form>
  )
}
