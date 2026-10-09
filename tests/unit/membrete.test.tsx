import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Membrete, PieInstitucional, type DatosMembrete } from '@/components/membrete'

const completa: DatosMembrete = {
  nombre: 'Álamos 23',
  nombreLegal: 'Edificio Álamos 23 Propiedad Horizontal',
  nit: '900123456-8',
  celular: '3001234567',
  direccion: 'Calle 23 # 4-56',
  ciudad: 'Bogotá D.C.',
  correo: 'admin@alamos.co',
  colorPrimario: '#1f6a4f',
  logoUrl: 'https://ejemplo.supabase.co/storage/v1/object/sign/marcas/x/logo.png?token=t',
}

describe('membrete y pie de los documentos', () => {
  it('usa la identidad de la copropiedad', () => {
    const m = renderToStaticMarkup(<Membrete identidad={completa} />)
    expect(m).toContain('Edificio Álamos 23 Propiedad Horizontal')
    expect(m).toContain('NIT 900.123.456-8')
    expect(m).toContain('marcas/x/logo.png')
    expect(m).not.toContain('Dato faltante')
    const p = renderToStaticMarkup(<PieInstitucional identidad={completa} />)
    expect(p).toContain('Administración')
    expect(p).toContain('Cel. 300 123 4567')
    expect(p).toContain('Calle 23 # 4-56, Bogotá D.C.')
    expect(p).toContain('admin@alamos.co')
  })

  it('marca lo que falta como «Dato faltante» y no inventa nada', () => {
    const vacia: DatosMembrete = { ...completa, nombreLegal: null, nit: null, celular: null, logoUrl: null, direccion: '', ciudad: '', correo: '' }
    const m = renderToStaticMarkup(<Membrete identidad={vacia} />)
    expect(m.match(/«Dato faltante»/g)).toHaveLength(3) // logo, nombre completo y NIT
    expect(m).not.toContain('<img')
    const p = renderToStaticMarkup(<PieInstitucional identidad={vacia} />)
    expect(p.match(/«Dato faltante»/g)).toHaveLength(3) // nombre completo, NIT y celular
  })

  it('no lleva el logo de PH PRO; como máximo la línea "Generado con PH PRO"', () => {
    const todo = renderToStaticMarkup(<><Membrete identidad={completa} /><PieInstitucional identidad={completa} /></>)
    expect(todo).not.toMatch(/icono-ph-pro|logo-ph-pro/i)
    expect(renderToStaticMarkup(<Membrete identidad={completa} />)).not.toContain('PH PRO')
    expect(renderToStaticMarkup(<PieInstitucional identidad={completa} generadoConPhPro={false} />)).not.toContain('PH PRO')
  })
})
