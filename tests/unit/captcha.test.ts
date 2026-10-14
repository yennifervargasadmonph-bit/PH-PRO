import { describe, expect, it } from 'vitest'
import { MENSAJE_FALTA_CAPTCHA, configCaptcha, tokenCaptcha } from '@/lib/captcha'
import { construirCsp } from '@/lib/encabezados'

const formulario = (captcha?: string) => {
  const f = new FormData()
  if (captcha !== undefined) f.set('captcha', captcha)
  return f
}

describe('CAPTCHA', () => {
  it('sin variables de entorno no hay CAPTCHA y el formulario sigue igual', () => {
    expect(configCaptcha(undefined, undefined)).toBeNull()
    expect(configCaptcha('turnstile', '')).toBeNull()
    expect(configCaptcha('recaptcha', 'clave')).toBeNull()
    expect(tokenCaptcha(formulario(), null)).toEqual({})
  })

  it('con Turnstile o hCaptcha configurado, arma el script y los orígenes de la CSP', () => {
    const t = configCaptcha(' Turnstile ', '1x00000000000000000000AA')!
    expect(t).toMatchObject({ proveedor: 'turnstile', global: 'turnstile', siteKey: '1x00000000000000000000AA' })
    expect(t.script).toContain('render=explicit')
    const h = configCaptcha('hcaptcha', 'clave')!
    expect(h.global).toBe('hcaptcha')
    const csp = construirCsp({ nonce: 'n', captcha: h.csp })
    expect(csp).toContain('frame-src https://hcaptcha.com https://*.hcaptcha.com')
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline' https:\/\/hcaptcha\.com/)
  })

  it('si está configurado exige el token y lo entrega para Supabase', () => {
    const c = configCaptcha('turnstile', 'clave')
    expect(tokenCaptcha(formulario(), c)).toEqual({ error: MENSAJE_FALTA_CAPTCHA })
    expect(tokenCaptcha(formulario('  '), c)).toEqual({ error: MENSAJE_FALTA_CAPTCHA })
    expect(tokenCaptcha(formulario('tok-123'), c)).toEqual({ token: 'tok-123' })
  })
})
