import { describe, expect, it } from 'vitest'
import { digitoVerificacion, esquemaCopropiedad, normalizarNit, sugerirPrefijo } from '@/lib/validacion'
import { destinoSeguro, sesionVencida } from '@/lib/sesion'

describe('NIT', () => {
  it('calcula el dígito de verificación de la DIAN', () => {
    expect(digitoVerificacion('900123456')).toBe(8)
    expect(digitoVerificacion('800197268')).toBe(4) // DIAN
    expect(digitoVerificacion('860034313')).toBe(7)
  })

  it('normaliza puntos y espacios y completa el dígito', () => {
    expect(normalizarNit('900.123.456')).toBe('900123456-8')
    expect(normalizarNit('900123456-8')).toBe('900123456-8')
    expect(normalizarNit(' 800 197 268-4 ')).toBe('800197268-4')
  })

  it('rechaza un dígito de verificación equivocado o un formato inválido', () => {
    expect(normalizarNit('900123456-1')).toBeNull()
    expect(normalizarNit('abc')).toBeNull()
    expect(normalizarNit('123')).toBeNull()
  })
})

describe('copropiedad', () => {
  it('sugiere prefijos documentales cortos', () => {
    expect(sugerirPrefijo('Edificio Álamos 23')).toBe('A23')
    expect(sugerirPrefijo('Urbanización Santa Elena')).toBe('SE')
  })

  it('valida y normaliza el formulario', () => {
    const r = esquemaCopropiedad.parse({ nombre: ' Edificio Álamos 23 ', nit: '', tipo: 'edificio', prefijo: 'a23' })
    expect(r).toMatchObject({ nombre: 'Edificio Álamos 23', nit: null, prefijo: 'A23', ciudad: '' })
    expect(esquemaCopropiedad.safeParse({ nombre: 'X Y', tipo: 'edificio', prefijo: 'A 2', nit: '' }).success).toBe(false)
  })
})

describe('sesión', () => {
  it('vence después de 30 minutos sin actividad', () => {
    const ahora = Date.now()
    expect(sesionVencida(String(ahora - 29 * 60_000), ahora)).toBe(false)
    expect(sesionVencida(String(ahora - 31 * 60_000), ahora)).toBe(true)
    expect(sesionVencida(undefined, ahora)).toBe(false)
  })

  it('solo redirige a rutas internas', () => {
    expect(destinoSeguro('/c/123')).toBe('/c/123')
    expect(destinoSeguro('https://malo.com')).toBe('/central')
    expect(destinoSeguro('//malo.com')).toBe('/central')
    expect(destinoSeguro(null)).toBe('/central')
  })
})
