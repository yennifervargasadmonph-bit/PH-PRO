import type { MetadataRoute } from 'next'

// Permite instalar PH PRO en la pantalla de inicio del celular.
// El trabajo sin conexión no viene incluido: se diseñará aparte.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PH PRO · Propiedad horizontal',
    short_name: 'PH PRO',
    description: 'Administración de propiedad horizontal en Colombia',
    start_url: '/central',
    display: 'standalone',
    background_color: '#f2f4f3',
    theme_color: '#0f3d2e',
    lang: 'es-CO',
    icons: [{ src: '/icono-ph-pro.png', sizes: '512x512', type: 'image/png' }],
  }
}
