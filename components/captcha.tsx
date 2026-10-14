'use client'
import { useEffect, useRef, useState } from 'react'
import { configCaptcha } from '@/lib/captcha'

type ApiCaptcha = {
  render(el: HTMLElement, opciones: Record<string, unknown>): string
  remove?(id: string): void
}

const config = configCaptcha()
let cargando: Promise<void> | null = null

function cargarScript(src: string) {
  cargando ??= new Promise<void>((ok, falla) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => ok()
    s.onerror = () => {
      cargando = null
      falla(new Error('No cargó el CAPTCHA'))
    }
    document.head.appendChild(s)
  })
  return cargando
}

/**
 * Widget de CAPTCHA (Turnstile o hCaptcha) que deja el token en un campo oculto "captcha".
 * No muestra nada si no está configurado. Cada token sirve una vez: el formulario vuelve a
 * montar el widget (cambiando su `key`) después de cada intento.
 */
export function Captcha() {
  const caja = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!config) return
    let vigente = true
    let id: string | null = null
    let api: ApiCaptcha | undefined
    cargarScript(config.script)
      .then(() => {
        api = (window as unknown as Record<string, ApiCaptcha | undefined>)[config.global]
        if (!vigente || !caja.current || !api) return
        id = api.render(caja.current, {
          sitekey: config.siteKey,
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        })
      })
      .catch(() => vigente && setError(true))
    return () => {
      vigente = false
      if (id && api?.remove) api.remove(id)
    }
  }, [])

  if (!config) return null
  return (
    <div>
      <div ref={caja} />
      <input type="hidden" name="captcha" value={token} />
      {error && <p className="aviso error" role="alert">No pudimos cargar la verificación de seguridad. Revisa tu conexión y recarga la página.</p>}
    </div>
  )
}
