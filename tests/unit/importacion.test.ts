import { describe, expect, it } from 'vitest'
import { clasificar, detectarEncabezados, leerCsv, leerNumero, leerTipo, validarFilas, PLANTILLA_CSV } from '@/lib/importacion/unidades'

describe('leerNumero', () => {
  it('entiende formatos colombianos e ingleses', () => {
    expect(leerNumero('1,25')).toBe(1.25)
    expect(leerNumero('1.234,56')).toBe(1234.56)
    expect(leerNumero('1,234.56')).toBe(1234.56)
    expect(leerNumero('2.5 %')).toBe(2.5)
    expect(leerNumero(0.0125)).toBe(0.0125)
    expect(leerNumero('1.234.567')).toBe(1234567)
    expect(leerNumero('abc')).toBeNull()
    expect(leerNumero('')).toBeNull()
  })
})

describe('leerTipo', () => {
  it('reconoce los nombres habituales', () => {
    expect(leerTipo('Apto')).toBe('apartamento')
    expect(leerTipo('')).toBe('apartamento')
    expect(leerTipo('Garaje')).toBe('parqueadero')
    expect(leerTipo('Cuarto útil')).toBe('deposito')
    expect(leerTipo('Consultorio')).toBe('oficina')
    expect(leerTipo('Piscina')).toBeNull()
  })
})

describe('detectarEncabezados', () => {
  it('encuentra la fila de encabezados aunque haya un título encima', () => {
    const filas = [['Listado de unidades Álamos 23'], [], ['Bloque', 'Apto', 'Coef. de copropiedad', 'Área m²'], ['1', '101', '50', '70']]
    const r = detectarEncabezados(filas)
    expect(r.filaEncabezado).toBe(2)
    expect(r.mapeo).toMatchObject({ torre: 0, numero: 1, coeficiente: 2, area_m2: 3 })
  })
})

describe('validarFilas', () => {
  const enc = ['Torre', 'Número', 'Tipo', 'Coeficiente']

  it('rechaza filas inválidas con su número de fila y motivo', () => {
    const filas = [enc, ['1', '101', 'Apto', '50'], ['1', '', 'Apto', '10'], ['1', '103', 'Piscina', '10'], ['1', '104', '', 'x'], ['1', '101', '', '5']]
    const { validas, rechazos } = validarFilas(filas, detectarEncabezados(filas).mapeo, 0)
    expect(validas.map((v) => v.numero)).toEqual(['101'])
    expect(rechazos).toEqual([
      { fila: 3, motivo: 'Falta el número de unidad.' },
      { fila: 4, motivo: 'No reconocemos el tipo "Piscina".' },
      { fila: 5, motivo: 'El coeficiente no es un número.' },
      { fila: 6, motivo: 'Repite la unidad de la fila 2.' },
    ])
  })

  it('convierte coeficientes en fracción a porcentaje', () => {
    const filas = [enc, ['1', '101', '', '0,5'], ['1', '102', '', '0,25'], ['1', '103', '', '0,25']]
    const r = validarFilas(filas, detectarEncabezados(filas).mapeo, 0)
    expect(r.escala).toBe(100)
    expect(r.validas.map((v) => v.coeficiente)).toEqual([50, 25, 25])
  })

  it('avisa si falta una columna obligatoria', () => {
    const r = validarFilas([['Torre', 'Número']], { torre: 0, numero: 1 }, 0)
    expect(r.error).toMatch(/Coeficiente/)
  })

  it('ignora filas vacías', () => {
    const filas = [enc, ['1', '101', '', '100'], ['', '', '', '']]
    expect(validarFilas(filas, detectarEncabezados(filas).mapeo, 0).rechazos).toEqual([])
  })
})

describe('clasificar', () => {
  it('separa nuevas, actualizadas y sin cambios', () => {
    const filas = [['Torre', 'Número', 'Coeficiente'], ['1', '101', '50'], ['1', '102', '30'], ['1', '103', '20']]
    const { validas } = validarFilas(filas, detectarEncabezados(filas).mapeo, 0)
    const existentes = [
      { torre: '1', numero: '101', tipo: 'apartamento' as const, coeficiente: 50, area_m2: null, matricula_inmobiliaria: '', activa: true },
      { torre: '1', numero: '102', tipo: 'apartamento' as const, coeficiente: 40, area_m2: null, matricula_inmobiliaria: '', activa: true },
    ]
    expect(clasificar(validas, existentes).map((c) => c.estado)).toEqual(['sin_cambios', 'actualizada', 'nueva'])
  })
})

describe('CSV', () => {
  it('lee punto y coma, comillas y la plantilla', () => {
    expect(leerCsv('a;"b;c";"d ""e"""\r\n1;2;3')).toEqual([['a', 'b;c', 'd "e"'], ['1', '2', '3']])
    const filas = leerCsv(PLANTILLA_CSV)
    const r = validarFilas(filas, detectarEncabezados(filas).mapeo, 0)
    expect(r.rechazos).toEqual([])
    expect(r.validas).toHaveLength(3)
    expect(r.validas[2]).toMatchObject({ torre: '', numero: 'LOCAL 1', tipo: 'local', coeficiente: 0.8, area_m2: 40 })
  })
})
