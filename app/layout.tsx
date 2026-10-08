import type { Metadata, Viewport } from 'next'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  )
}
