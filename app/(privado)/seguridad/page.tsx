'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/client'

type Factor = { id: string; friendly_name?: string; status: string }

export default function Seguridad() {
  const [factores, setFactores] = useState<Factor[] | null>(null)
  const [alta, setAlta] = useState<{ id: string; qr: string; secreto: string } | null>(null)
  const [codigo, setCodigo] = useState('')
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'ok'; texto: string } | null>(null)

  const leerFactores = () => crearClienteNavegador().auth.mfa.listFactors().then(({ data }) => (data?.totp ?? []) as Factor[])
  async function cargar() {
    setFactores(await leerFactores())
  }
  useEffect(() => {
    let vigente = true
    leerFactores().then((f) => vigente && setFactores(f))
    return () => { vigente = false }
  }, [])

  async function activar() {
    setMensaje(null)
    const { data, error } = await crearClienteNavegador().auth.mfa.enroll({ factorType: 'totp', friendlyName: `PH PRO ${new Date().toISOString().slice(0, 10)}` })
    if (error || !data) return setMensaje({ tipo: 'error', texto: 'No pudimos iniciar la activación. Inténtalo de nuevo.' })
    setAlta({ id: data.id, qr: data.totp.qr_code, secreto: data.totp.secret })
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!alta) return
    const { error } = await crearClienteNavegador().auth.mfa.challengeAndVerify({ factorId: alta.id, code: codigo.trim() })
    if (error) return setMensaje({ tipo: 'error', texto: 'El código no es válido. Inténtalo de nuevo.' })
    setAlta(null)
    setCodigo('')
    setMensaje({ tipo: 'ok', texto: 'Listo. Desde ahora PH PRO te pedirá el código al ingresar.' })
    await cargar()
  }

  const activa = factores?.some((f) => f.status === 'verified')

  return (
    <>
      <div className="cabecera"><div><h1>Seguridad</h1><p className="tenue">Protege tu cuenta con verificación en dos pasos.</p></div></div>
      <section className="panel" style={{ maxWidth: 620 }}>
        <h2>Verificación en dos pasos</h2>
        {factores === null ? (
          <p className="tenue">Cargando…</p>
        ) : activa ? (
          <p className="aviso ok">Activa. Al ingresar te pediremos el código de tu aplicación autenticadora.</p>
        ) : alta ? (
          <form className="campos" onSubmit={confirmar}>
            <p>1. Escanea este código con Google Authenticator, Microsoft Authenticator o similar.</p>
            <img className="qr" src={alta.qr} alt="Código QR para la aplicación autenticadora" />
            <p className="pequeno tenue">Si no puedes escanearlo, escribe esta clave: <code>{alta.secreto}</code></p>
            <label>2. Escribe el código de 6 dígitos<input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
            <div><button className="boton">Confirmar</button></div>
          </form>
        ) : (
          <>
            <p className="tenue">Recomendada para administradoras, contadores y revisores fiscales.</p>
            <button className="boton" onClick={activar}>Activar verificación en dos pasos</button>
          </>
        )}
        {mensaje && <p className={`aviso ${mensaje.tipo}`} style={{ marginTop: 12 }}>{mensaje.texto}</p>}
      </section>
    </>
  )
}
