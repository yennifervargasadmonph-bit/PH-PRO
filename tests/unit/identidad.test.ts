import { describe, expect, it } from 'vitest'
import {
  calcularDv,
  faltantesIdentidad,
  formatearCelular,
  formatearNit,
  listarEnEspanol,
  normalizarCelular,
  validarLogo,
  validarNit,
  validarNombreLegal,
} from '@/lib/identidad'

describe('dígito de verificación del NIT (DIAN)', () => {
  it('coincide con NIT reales y casos conocidos', () => {
    expect(calcularDv('800197268')).toBe(4) // DIAN
    expect(calcularDv('860034313')).toBe(7)
    expect(calcularDv('900123456')).toBe(8)
    expect(calcularDv('899999034')).toBe(1) // SENA
    expect(calcularDv('830115226')).toBe(3)
  })

  it('aplica la regla r < 2 → r, si no 11 − r', () => {
    // 000001: 1×3 = 3 → 11−3 = 8; 000000: 0 → 0; residuo 1 → 1
    expect(calcularDv('000001')).toBe(8)
    expect(calcularDv('000000')).toBe(0)
    expect(calcularDv('4')).toBe(1) // 4×3 = 12, 12 mod 11 = 1
  })

  it('valida el NIT escrito de varias formas', () => {
    expect(validarNit('900.123.456-8')).toEqual({ ok: true, nit: '900123456-8' })
    expect(validarNit(' 900 123 456-8 ')).toEqual({ ok: true, nit: '900123456-8' })
    expect(validarNit('900123456')).toEqual({ ok: true, nit: '900123456-8' })
  })

  it('rechaza un dígito equivocado con el mensaje acordado', () => {
    expect(validarNit('900123456-7')).toEqual({ ok: false, error: 'El dígito de verificación no corresponde a este NIT.' })
    expect(validarNit('12-3').ok).toBe(false)
    expect(validarNit('NIT').ok).toBe(false)
  })

  it('formatea con puntos de miles', () => {
    expect(formatearNit('900123456-8')).toBe('900.123.456-8')
    expect(formatearNit('8001972684')).toBe('8.001.972.684')
    expect(formatearNit('123456-0')).toBe('123.456-0')
  })
})

describe('celular', () => {
  it('normaliza espacios, guiones, paréntesis y el +57', () => {
    expect(normalizarCelular('300 123 4567')).toBe('3001234567')
    expect(normalizarCelular('+57 300-123-4567')).toBe('3001234567')
    expect(normalizarCelular('(+57) 315.555.1234')).toBe('3155551234')
    expect(normalizarCelular('573001234567')).toBe('3001234567')
  })

  it('rechaza fijos, números cortos y letras', () => {
    expect(normalizarCelular('601 123 4567')).toBeNull()
    expect(normalizarCelular('300123456')).toBeNull()
    expect(normalizarCelular('30012345678')).toBeNull()
    expect(normalizarCelular('300abc4567')).toBeNull()
    expect(normalizarCelular('')).toBeNull()
  })

  it('se muestra como 300 123 4567', () => {
    expect(formatearCelular('3001234567')).toBe('300 123 4567')
    expect(formatearCelular('+573001234567')).toBe('300 123 4567')
  })
})

describe('nombre completo', () => {
  it('normaliza espacios y exige de 5 a 160 caracteres', () => {
    expect(validarNombreLegal('  Edificio   Álamos 23  PH ')).toEqual({ ok: true, nombre: 'Edificio Álamos 23 PH' })
    expect(validarNombreLegal('PH').ok).toBe(false)
    expect(validarNombreLegal('x'.repeat(161)).ok).toBe(false)
  })
})

describe('datos faltantes', () => {
  it('lista lo que falta en el orden en que se pide', () => {
    expect(faltantesIdentidad({ logoRuta: null, nombreLegal: 'Edificio X', nit: null, celular: null })).toEqual(['logo', 'NIT', 'celular'])
    expect(faltantesIdentidad({ logoRuta: 'a/logo.png', nombreLegal: 'Edificio X', nit: '900123456-8', celular: '3001234567' })).toEqual([])
    expect(listarEnEspanol(['logo', 'NIT', 'celular'])).toBe('logo, NIT y celular')
    expect(listarEnEspanol(['NIT'])).toBe('NIT')
  })
})

describe('logo', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  const svg = (s: string) => new TextEncoder().encode(s)

  it('acepta PNG, JPG, WEBP y SVG reales', () => {
    expect(validarLogo('image/png', png)).toEqual({ ok: true, extension: 'png' })
    expect(validarLogo('image/jpeg', jpg)).toEqual({ ok: true, extension: 'jpg' })
    expect(validarLogo('image/webp', webp)).toEqual({ ok: true, extension: 'webp' })
    expect(validarLogo('image/svg+xml', svg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))).toEqual({ ok: true, extension: 'svg' })
  })

  it('rechaza otros tipos, contenidos que no corresponden y archivos de más de 2 MB', () => {
    expect(validarLogo('application/pdf', png).ok).toBe(false)
    expect(validarLogo('image/gif', png).ok).toBe(false)
    expect(validarLogo('image/png', jpg).ok).toBe(false)
    expect(validarLogo('image/png', new Uint8Array(0)).ok).toBe(false)
    const grande = new Uint8Array(2 * 1024 * 1024 + 1)
    grande.set(png)
    expect(validarLogo('image/png', grande)).toEqual({ ok: false, error: 'El logo no puede pesar más de 2 MB.' })
  })

  it('rechaza SVG con código activo', () => {
    expect(validarLogo('image/svg+xml', svg('<svg><script>alert(1)</script></svg>')).ok).toBe(false)
    expect(validarLogo('image/svg+xml', svg('<svg onload="x()"></svg>')).ok).toBe(false)
    expect(validarLogo('image/svg+xml', svg('<svg><a href="javascript:x()"/></svg>')).ok).toBe(false)
  })
})
