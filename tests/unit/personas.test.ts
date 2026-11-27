import { describe, expect, it } from 'vitest'
import { esquemaAutorizacion, esquemaPersona, esquemaVinculo, estadoAutorizacion, fechaCorta, periodo, puntoAutorizacion, vinculoVigente } from '@/lib/personas'

describe('personas y autorizaciones', () => {
  it('un vínculo vigente ya empezó y no ha terminado', () => {
    expect(vinculoVigente({ desde: '2020-01-01', hasta: null }, '2026-11-27')).toBe(true)
    expect(vinculoVigente({ desde: null, hasta: null }, '2026-11-27')).toBe(true)
    expect(vinculoVigente({ desde: '2020-01-01', hasta: '2026-11-26' }, '2026-11-27')).toBe(false)
    expect(vinculoVigente({ desde: '2027-01-01', hasta: null }, '2026-11-27')).toBe(false)
  })

  it('estado de la autorización: basta una sin revocar', () => {
    expect(estadoAutorizacion([])).toBe('sin')
    expect(estadoAutorizacion([{ revocada_en: '2026-01-01' }])).toBe('revocada')
    expect(estadoAutorizacion([{ revocada_en: '2026-01-01' }, { revocada_en: null }])).toBe('vigente')
    expect(puntoAutorizacion('sin')).toBe('ambar')
    expect(puntoAutorizacion('revocada')).toBe('rojo')
    expect(puntoAutorizacion('vigente')).toBeNull()
  })

  it('fechas sin inventar: lo que falta se dice', () => {
    expect(fechaCorta('2026-01-15')).toBe('15 ene 2026')
    expect(periodo({ desde: null, hasta: null })).toBe('Fechas: dato faltante')
    expect(periodo({ desde: '2020-01-15', hasta: null })).toBe('Desde 15 ene 2020')
  })

  it('valida la persona y normaliza documento y celular', () => {
    const r = esquemaPersona.parse({ nombre: 'Ana Pérez', tipo_documento: 'CC', numero_documento: '52.123.456', correo: '', celular: '300 123 4567', telefono: '' })
    expect(r).toMatchObject({ numero_documento: '52123456', celular: '3001234567', correo: null, telefono: null })
    expect(esquemaPersona.safeParse({ nombre: 'Ana', numero_documento: '123456', tipo_documento: '' }).success).toBe(false)
    expect(esquemaPersona.safeParse({ nombre: 'Ana', correo: 'no-es-correo' }).success).toBe(false)
  })

  it('solo un propietario es titular y las fechas van en orden', () => {
    expect(esquemaVinculo.safeParse({ tipo: 'residente', es_titular: 'on' }).success).toBe(false)
    expect(esquemaVinculo.safeParse({ tipo: 'propietario', desde: '2024-05-01', hasta: '2024-01-01' }).success).toBe(false)
    expect(esquemaVinculo.parse({ tipo: 'propietario', es_titular: 'on', desde: '', hasta: '' })).toMatchObject({ es_titular: true, reside: false, desde: null })
  })

  it('la autorización exige finalidades y fecha no futura', () => {
    const base = { politica_id: '00000000-0000-4000-8000-000000000001', canal: 'escrito', otorgada_en: '2026-01-10' }
    expect(esquemaAutorizacion.safeParse({ ...base, finalidades: [] }).success).toBe(false)
    expect(esquemaAutorizacion.safeParse({ ...base, finalidades: ['mercadeo'] }).success).toBe(false)
    expect(esquemaAutorizacion.safeParse({ ...base, otorgada_en: '2999-01-01', finalidades: ['administracion'] }).success).toBe(false)
    expect(esquemaAutorizacion.safeParse({ ...base, finalidades: ['administracion'] }).success).toBe(true)
  })
})
