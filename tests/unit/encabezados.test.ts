import { describe, expect, it } from 'vitest'
import { ENCABEZADOS_FIJOS, construirCsp, encabezadosSeguridad, generarNonce } from '@/lib/encabezados'

const directivas = (csp: string) => Object.fromEntries(csp.split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v] }))

describe('Content-Security-Policy', () => {
  const csp = construirCsp({ nonce: 'abc123', supabaseUrl: 'https://proyecto.supabase.co' })
  const d = directivas(csp)

  it('los scripts solo corren con el nonce de la solicitud', () => {
    expect(d['script-src']).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"])
    expect(csp).not.toContain('unsafe-eval')
  })

  it('no se puede enmarcar, ni cargar objetos, ni cambiar la base', () => {
    expect(d['frame-ancestors']).toEqual(["'none'"])
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['base-uri']).toEqual(["'self'"])
    expect(d['form-action']).toEqual(["'self'"])
    expect(d['frame-src']).toEqual(["'none'"])
    expect(d['upgrade-insecure-requests']).toEqual([])
  })

  it('permite hablar con Supabase por HTTPS y websocket, y mostrar sus imágenes', () => {
    expect(d['connect-src']).toEqual(["'self'", 'https://proyecto.supabase.co', 'wss://proyecto.supabase.co'])
    expect(d['img-src']).toContain('https://proyecto.supabase.co')
  })

  it('con Supabase local usa http y ws', () => {
    const local = directivas(construirCsp({ nonce: 'n', supabaseUrl: 'http://127.0.0.1:54321' }))
    expect(local['connect-src']).toEqual(["'self'", 'http://127.0.0.1:54321', 'ws://127.0.0.1:54321'])
  })

  it('ignora una URL de Supabase ausente o inválida', () => {
    for (const supabaseUrl of [undefined, null, '', 'no es url', 'javascript:alert(1)']) {
      expect(directivas(construirCsp({ nonce: 'n', supabaseUrl }))['connect-src']).toEqual(["'self'"])
    }
  })

  it('en desarrollo permite eval (recarga en caliente) y no fuerza HTTPS', () => {
    const dev = construirCsp({ nonce: 'n', desarrollo: true })
    expect(directivas(dev)['script-src']).toContain("'unsafe-eval'")
    expect(dev).not.toContain('upgrade-insecure-requests')
  })

  it('agrega los orígenes del CAPTCHA solo si está configurado', () => {
    const conCaptcha = directivas(
      construirCsp({ nonce: 'n', captcha: { scripts: ['https://challenges.cloudflare.com'], marcos: ['https://challenges.cloudflare.com'], conexiones: [] } }),
    )
    expect(conCaptcha['script-src']).toContain('https://challenges.cloudflare.com')
    expect(conCaptcha['frame-src']).toEqual(['https://challenges.cloudflare.com'])
  })
})

describe('encabezados de seguridad', () => {
  it('incluye HSTS, nosniff, Referrer-Policy y la CSP', () => {
    const h = encabezadosSeguridad({ nonce: 'n' })
    expect(h['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Content-Security-Policy']).toContain("'nonce-n'")
    expect(Object.keys(ENCABEZADOS_FIJOS)).not.toContain('Content-Security-Policy')
  })

  it('el nonce cambia en cada solicitud', () => {
    const a = generarNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/=]{40,}$/)
    expect(generarNonce()).not.toBe(a)
  })
})
