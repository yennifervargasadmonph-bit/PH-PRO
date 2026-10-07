'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/client'

const MINIMO = 12

export default function NuevaClave() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const clave = String(f.get('clave'))
    if (clave.length < MINIMO) return setError(`Usa al menos ${MINIMO} caracteres.`)
    if (clave !== f.get('confirmacion')) return setError('Las contraseñas no coinciden.')
    setEnviando(true)
    const { error } = await crearClienteNavegador().auth.updateUser({ password: clave })
    setEnviando(false)
    if (error) return setError('No pudimos guardar la contraseña. Prueba con una más fuerte.')
    router.replace('/central')
  }

  return (
    <section className="panel" style={{ maxWidth: 480 }}>
      <h1>Nueva contraseña</h1>
      <form className="campos" onSubmit={guardar}>
        <label>Contraseña nueva <small>(mínimo {MINIMO} caracteres)</small><input name="clave" type="password" autoComplete="new-password" required /></label>
        <label>Confírmala<input name="confirmacion" type="password" autoComplete="new-password" required /></label>
        {error && <p className="aviso error" role="alert">{error}</p>}
        <div><button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </section>
  )
}
