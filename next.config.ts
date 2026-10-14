import type { NextConfig } from 'next'
import { ENCABEZADOS_FIJOS } from './lib/encabezados'

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
