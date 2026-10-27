import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMITES, consumir, ipCliente, mensajeLimite, reiniciarLimites } from '@/lib/limite'
import { evaluarOrigen, origenesPermitidos } from '@/lib/origen'
import { HORAS_SESION_MAXIMA, destinoSeguro, sesionExcedeMaximo } from '@/lib/sesion'
import { urlSitio } from '@/lib/sitio'

// Auditoría de seguridad del 27/10/2026.

describe('redirección después de ingresar', () => {
  it('no se deja llevar a otro dominio con caracteres de control o barra invertida', () => {
    for (const malo of ['/\t/malo.com', '/\n/malo.com', '/\r\n/malo.com', '/\\malo.com', '/a\\b', '/\u0000x', 'https://malo.com', '//malo.com', ' /c', '']) {
      expect(destinoSeguro(malo)).toBe('/central')
    }
  })

  it('conserva rutas internas con parámetros', () => {
    expect(destinoSeguro('/c/123?pestana=unidades#arriba')).toBe('/c/123?pestana=unidades#arriba')
    expect(destinoSeguro('/%09/malo.com')).toBe('/%09/malo.com')
  })
})

describe('duración máxima de la sesión', () => {
  const ahora = Date.UTC(2026, 9, 27, 20)
  const hace = (horas: number) => [{ method: 'password', timestamp: Math.floor((ahora - horas * 3_600_000) / 1000) }]

  it(`corta la sesión después de ${HORAS_SESION_MAXIMA} horas desde el ingreso`, () => {
    expect(sesionExcedeMaximo(hace(11), ahora)).toBe(false)
    expect(sesionExcedeMaximo(hace(13), ahora)).toBe(true)
  })

  it('cuenta desde el primer paso aunque el código se haya puesto después', () => {
    const amr = [...hace(13), { method: 'totp', timestamp: Math.floor(ahora / 1000) - 60 }]
    expect(sesionExcedeMaximo(amr, ahora)).toBe(true)
  })

  it('sin amr legible no decide', () => {
    expect(sesionExcedeMaximo(undefined, ahora)).toBe(false)
    expect(sesionExcedeMaximo([{ method: 'password' }], ahora)).toBe(false)
  })
})

describe('URL pública para los enlaces', () => {
  it('en producción solo sale de NEXT_PUBLIC_SITE_URL con https', () => {
    expect(urlSitio({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://app.phpro.co/' })).toBe('https://app.phpro.co')
    expect(urlSitio({ NODE_ENV: 'production' })).toBeNull()
    expect(urlSitio({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://app.phpro.co' })).toBeNull()
    expect(urlSitio({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'no es url' })).toBeNull()
  })

  it('en desarrollo usa localhost', () => {
    expect(urlSitio({ NODE_ENV: 'development' })).toBe('http://localhost:3000')
  })
})

describe('CORS y envíos desde otros sitios', () => {
  const propio = 'https://app.phpro.co'
  const base = { propio, secFetchSite: null }

  it('las consultas (GET) pasan, pero la aplicación nunca autoriza a otro origen a leerlas', () => {
    expect(evaluarOrigen({ ...base, metodo: 'GET', origin: 'https://malo.com' }).permitir).toBe(true)
  })

  it('rechaza la pregunta previa de CORS de otro origen', () => {
    expect(evaluarOrigen({ ...base, metodo: 'OPTIONS', origin: 'https://malo.com' })).toMatchObject({ permitir: false, estado: 403 })
    expect(evaluarOrigen({ ...base, metodo: 'OPTIONS', origin: null }).permitir).toBe(false)
  })

  it('rechaza envíos de otro sitio y acepta los propios', () => {
    expect(evaluarOrigen({ ...base, metodo: 'POST', origin: 'https://malo.com' }).permitir).toBe(false)
    expect(evaluarOrigen({ ...base, metodo: 'POST', origin: 'null' }).permitir).toBe(false)
    expect(evaluarOrigen({ ...base, metodo: 'DELETE', origin: null, secFetchSite: 'cross-site' }).permitir).toBe(false)
    expect(evaluarOrigen({ ...base, metodo: 'POST', origin: propio }).permitir).toBe(true)
  })

  it('acepta los orígenes configurados', () => {
    const permitidos = origenesPermitidos('https://votar.phpro.co/, mal escrito', undefined)
    expect(permitidos).toEqual(['https://votar.phpro.co'])
    expect(evaluarOrigen({ ...base, metodo: 'POST', origin: 'https://votar.phpro.co', permitidos }).permitir).toBe(true)
  })
})

describe('límite de intentos', () => {
  afterEach(() => {
    reiniciarLimites()
    vi.unstubAllEnvs()
  })

  it('corta al superar el máximo y se reinicia con la ventana', async () => {
    const regla = { max: 3, ventanaSegundos: 60 }
    const t = 1_000_000
    for (let i = 0; i < 3; i++) expect((await consumir('prueba', regla, t)).permitido).toBe(true)
    const cuarto = await consumir('prueba', regla, t + 1000)
    expect(cuarto.permitido).toBe(false)
    expect(cuarto.reintentarEnSegundos).toBe(59)
    expect(mensajeLimite(cuarto)).toMatch(/Espera 1 minuto/)
    expect((await consumir('prueba', regla, t + 61_000)).permitido).toBe(true)
  })

  it('cada IP o persona tiene su propio contador', async () => {
    const regla = LIMITES.ingresoIp
    for (let i = 0; i < regla.max; i++) await consumir('ingreso:ip:1.1.1.1', regla)
    expect((await consumir('ingreso:ip:1.1.1.1', regla)).permitido).toBe(false)
    expect((await consumir('ingreso:ip:2.2.2.2', regla)).permitido).toBe(true)
  })

  it('si Redis no responde, cuenta en memoria', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.invalid')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'x')
    const fetchFalla = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin red'))
    expect((await consumir('redis-caido', { max: 1, ventanaSegundos: 60 })).permitido).toBe(true)
    expect((await consumir('redis-caido', { max: 1, ventanaSegundos: 60 })).permitido).toBe(false)
    fetchFalla.mockRestore()
  })

  it('lee la IP de los encabezados del hosting y descarta valores raros', () => {
    expect(ipCliente(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(ipCliente(new Headers({ 'x-real-ip': '2001:db8::1', 'x-forwarded-for': '1.1.1.1' }))).toBe('2001:db8::1')
    expect(ipCliente(new Headers({ 'x-forwarded-for': '<script>' }))).toBe('desconocida')
    expect(ipCliente(new Headers())).toBe('desconocida')
  })
})
