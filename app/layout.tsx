import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
// Inter servida desde la propia aplicación (la CSP solo permite fuentes de 'self').
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'PH PRO', template: '%s · PH PRO' },
  description: 'Administración de propiedad horizontal en Colombia',
  appleWebApp: { capable: true, title: 'PH PRO', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f3d2e',
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
