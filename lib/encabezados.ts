// Encabezados de seguridad HTTP. Sin dependencias de Next ni alias "@/": lo usan
// proxy.ts (CSP con nonce por solicitud) y next.config.ts (encabezados fijos).

/** Encabezados que no cambian entre solicitudes (también para archivos estáticos). */
export const ENCABEZADOS_FIJOS: Record<string, string> = {
  // Dos años, incluidos subdominios. No se usa "preload" para no comprometer el dominio sin decidirlo.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

export type OpcionesCsp = {
  nonce: string
  /** NEXT_PUBLIC_SUPABASE_URL: el navegador habla con Auth (verificación en dos pasos) y Storage (logos). */
  supabaseUrl?: string | null
  /** En desarrollo Next necesita eval para recargar en caliente, y no hay HTTPS. */
  desarrollo?: boolean
  /** Orígenes extra del CAPTCHA, si está configurado. */
  captcha?: { scripts: string[]; marcos: string[]; conexiones: string[]; estilos?: string[] } | null
}

/** Nonce aleatorio por solicitud (base64 de un UUID v4, como en la guía de Next.js). */
export function generarNonce() {
  return btoa(crypto.randomUUID())
}

function origenesSupabase(url: string | null | undefined): { http: string; ws: string } | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return { http: u.origin, ws: `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}` }
  } catch {
    return null
  }
}

/**
 * Content-Security-Policy con nonce (guía de CSP de Next.js). Los scripts solo corren si
 * traen el nonce de esta solicitud o los cargó uno que lo traía ('strict-dynamic').
 * Los estilos admiten 'unsafe-inline' porque React escribe atributos style.
 */
export function construirCsp({ nonce, supabaseUrl, desarrollo = false, captcha = null }: OpcionesCsp) {
  const supa = origenesSupabase(supabaseUrl)
  const directivas: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(desarrollo ? ["'unsafe-eval'"] : []), ...(captcha?.scripts ?? [])]],
    ['style-src', ["'self'", "'unsafe-inline'", ...(captcha?.estilos ?? [])]],
    ['img-src', ["'self'", 'blob:', 'data:', ...(supa ? [supa.http] : [])]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...(supa ? [supa.http, supa.ws] : []), ...(captcha?.conexiones ?? [])]],
    ['frame-src', captcha?.marcos.length ? captcha.marcos : ["'none'"]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  const csp = directivas.map(([d, v]) => `${d} ${v.join(' ')}`)
  if (!desarrollo) csp.push('upgrade-insecure-requests')
  return csp.join('; ')
}

/** Todos los encabezados de seguridad de una página. */
export function encabezadosSeguridad(opciones: OpcionesCsp): Record<string, string> {
  return { ...ENCABEZADOS_FIJOS, 'Content-Security-Policy': construirCsp(opciones) }
}
