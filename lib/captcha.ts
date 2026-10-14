// CAPTCHA en ingreso y recuperación de contraseña (Supabase Auth > Bot and Abuse Protection).
// Se activa con NEXT_PUBLIC_CAPTCHA_PROVEEDOR ("turnstile" o "hcaptcha") y
// NEXT_PUBLIC_CAPTCHA_SITE_KEY. Sin ellas los formularios funcionan sin CAPTCHA.
// Supabase verifica el token en el servidor con la llave secreta configurada en su panel.

export type ProveedorCaptcha = 'turnstile' | 'hcaptcha'

export type ConfigCaptcha = {
  proveedor: ProveedorCaptcha
  siteKey: string
  /** Script del widget con render explícito. */
  script: string
  /** Objeto global que expone el script. */
  global: 'turnstile' | 'hcaptcha'
  /** Orígenes que necesita en la Content-Security-Policy. */
  csp: { scripts: string[]; marcos: string[]; conexiones: string[]; estilos: string[] }
}

const PROVEEDORES: Record<ProveedorCaptcha, Omit<ConfigCaptcha, 'proveedor' | 'siteKey'>> = {
  turnstile: {
    script: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    global: 'turnstile',
    csp: { scripts: ['https://challenges.cloudflare.com'], marcos: ['https://challenges.cloudflare.com'], conexiones: [], estilos: [] },
  },
  hcaptcha: {
    script: 'https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off',
    global: 'hcaptcha',
    csp: {
      scripts: ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
      marcos: ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
      conexiones: ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
      estilos: ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
    },
  },
}

/** Configuración del CAPTCHA a partir de las variables de entorno, o null si no está configurado. */
export function configCaptcha(
  proveedor = process.env.NEXT_PUBLIC_CAPTCHA_PROVEEDOR,
  siteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY,
): ConfigCaptcha | null {
  const p = proveedor?.trim().toLowerCase()
  const k = siteKey?.trim()
  if (!k || (p !== 'turnstile' && p !== 'hcaptcha')) return null
  return { proveedor: p, siteKey: k, ...PROVEEDORES[p] }
}

export const MENSAJE_FALTA_CAPTCHA = 'Completa la verificación de seguridad antes de continuar.'

/**
 * Lee el token del formulario para enviarlo a Supabase. Si el CAPTCHA está configurado y
 * falta el token, devuelve el error que se muestra a la persona.
 */
export function tokenCaptcha(formulario: FormData, config = configCaptcha()): { token?: string; error?: string } {
  if (!config) return {}
  const token = String(formulario.get('captcha') ?? '').trim()
  if (!token) return { error: MENSAJE_FALTA_CAPTCHA }
  return { token }
}
