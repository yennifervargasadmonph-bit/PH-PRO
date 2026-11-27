'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Cierra el panel lateral con la tecla Escape. */
export function CerrarConEscape({ destino }: { destino: string }) {
  const router = useRouter()
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(destino, { scroll: false })
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [destino, router])
  return null
}
