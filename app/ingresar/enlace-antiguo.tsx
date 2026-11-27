'use client'

import { useEffect, useState } from 'react'

// Los enlaces enviados desde el panel de Supabase con la plantilla por defecto llegan con los tokens en el
// fragmento (#access_token=…&type=recovery). Esta aplicación solo acepta enlaces que pasan por
// /auth/confirmar, así que aquí se borran esos tokens de la barra de direcciones y se explica qué hacer.
export function AvisoEnlaceAntiguo() {
  const [aviso, setAviso] = useState(false)
  useEffect(() => {
    const fragmento = new URLSearchParams(window.location.hash.slice(1))
    if (!fragmento.has('access_token') && !fragmento.has('error')) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    const t = setTimeout(() => setAviso(true), 0)
    return () => clearTimeout(t)
  }, [])
  if (!aviso) return null
  return (
    <p className="aviso info" style={{ marginBottom: 14 }} role="status">
      Ese enlace no se puede usar aquí. Pulsa «Olvidé mi contraseña» y te enviamos uno nuevo.
    </p>
  )
}
