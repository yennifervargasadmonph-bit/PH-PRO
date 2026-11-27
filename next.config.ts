import type { NextConfig } from 'next'
import { ENCABEZADOS_FIJOS } from './lib/encabezados'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Las páginas «page.dev.tsx» (vista previa del diseño con datos de ejemplo) solo existen en
  // desarrollo: en producción no se compilan ni se publican.
  pageExtensions: process.env.NODE_ENV === 'development' ? ['tsx', 'ts', 'dev.tsx'] : ['tsx', 'ts'],
  experimental: {
    // El logo de la copropiedad puede pesar hasta 2 MB (más el sobre del formulario).
    serverActions: { bodySizeLimit: '3mb' },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        // La Content-Security-Policy (con nonce por solicitud) la pone proxy.ts.
        headers: Object.entries(ENCABEZADOS_FIJOS).map(([key, value]) => ({ key, value })),
      },
    ]
  },
}

export default nextConfig
