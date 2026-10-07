'use client'
/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/client'

export default function Verificar() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function verificar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    const supabase = crearClienteNavegador()
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp?.find((f) => f.status === 'verified')
    if (!factor) {
      router.replace('/central')
      return
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo.trim() })
    setEnviando(false)
    if (error) return setError('El código no es válido. Revisa la hora de tu teléfono e inténtalo de nuevo.')
    router.replace('/central')
    router.refresh()
  }

  return (
    <main className="acceso">
      <div className="acceso-caja">
        <img className="acceso-logo" src="/logo-ph-pro.png" alt="PH PRO" />
        <h1>Verificación en dos pasos</h1>
        <p className="intro">Escribe el código de 6 dígitos de tu aplicación autenticadora.</p>
        <form className="campos" onSubmit={verificar}>
          <label>
            Código
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
          </label>
          {error && <p className="aviso error" role="alert">{error}</p>}
          <button className="boton" disabled={enviando}>{enviando ? 'Verificando…' : 'Verificar'}</button>
        </form>
        <form action="/salir" method="post" style={{ marginTop: 12, textAlign: 'center' }}>
          <button className="boton secundario">Salir</button>
        </form>
      </div>
    </main>
  )
}
