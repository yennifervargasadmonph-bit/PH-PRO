'use client'
import { createBrowserClient } from '@supabase/ssr'

/** Cliente de Supabase para componentes de cliente (por ejemplo, verificación en dos pasos). */
export function crearClienteNavegador() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
}
