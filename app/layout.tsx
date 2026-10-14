import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'PH PRO', template: '%s · PH PRO' },
  description: 'Administración de propiedad horizontal en Colombia',
  appleWebApp: { capable: true, title: 'PH PRO', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c3b26',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // La CSP lleva un nonce distinto en cada solicitud: todas las páginas se generan al
  // momento (una página prearmada no tendría el nonce y sus scripts quedarían bloqueados).
  await connection()
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  )
}
