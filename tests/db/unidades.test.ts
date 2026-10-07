import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { como, crearBaseDePrueba, crearUsuario } from './helpers'

// Sprint 2: permisos por rol y módulo, marca, unidades e importación.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
const u = { admin: '', auxiliar: '', porteria: '', consejo: '', revisor: '', otra: '', suelto: '' }
const copro = { alamos: '', santaElena: '', ajena: '' }

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  for (const k of Object.keys(u) as (keyof typeof u)[]) u[k] = await crearUsuario(db, `${k}@ejemplo.co`)

  const org = (await como(db, u.admin, `select crear_organizacion('Administración de prueba') as id`)).rows[0].id
  const orgB = (await como(db, u.otra, `select crear_organizacion('Otra') as id`)).rows[0].id
  const crear = (usuario: string, o: string, nombre: string, prefijo: string) =>
    como(db, usuario, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, $2, $3) returning id`, [o, nombre, prefijo]).then((r) => r.rows[0].id as string)
  copro.alamos = await crear(u.admin, org, 'Edificio Álamos 23', 'A23')
  copro.santaElena = await crear(u.admin, org, 'Urbanización Santa Elena', 'SE')
  copro.ajena = await crear(u.otra, orgB, 'Ajena', 'AJ')

  for (const [quien, rol] of [['auxiliar', 'auxiliar'], ['porteria', 'porteria'], ['consejo', 'consejo'], ['revisor', 'revisor_fiscal']] as const) {
    await como(db, u.admin, `select agregar_miembro($1, $2)`, [org, `${quien}@ejemplo.co`])
    await como(db, u.admin, `insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, $3)`, [copro.alamos, u[quien], rol])
  }

  await como(db, u.admin, `insert into unidades (copropiedad_id, torre, numero, coeficiente) values ($1, '1', '101', 50), ($1, '1', '102', 50)`, [copro.alamos])
  await como(db, u.admin, `insert into unidades (copropiedad_id, numero, tipo, coeficiente) values ($1, 'Casa 1', 'casa', 100)`, [copro.santaElena])
  await como(db, u.otra, `insert into unidades (copropiedad_id, numero, coeficiente) values ($1, '1', 100)`, [copro.ajena])
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const filas = [
  { torre: '1', numero: '101', tipo: 'apartamento', coeficiente: 40 }, // cambia el coeficiente
  { torre: '1', numero: '102', tipo: 'apartamento', coeficiente: 50 }, // igual
  { torre: '2', numero: '201', tipo: 'apartamento', coeficiente: 10, area_m2: 72.5 }, // nueva
]

describe('equipo', () => {
  it('solo se agregan personas con cuenta existente', async () => {
    const org = (await como(db, u.admin, 'select id from organizaciones')).rows[0].id
    await expect(como(db, u.admin, `select agregar_miembro($1, 'nadie@ejemplo.co')`, [org])).rejects.toThrow(/No hay una cuenta/)
  })

  it('solo la administración agrega personas', async () => {
    const org = (await como(db, u.admin, 'select id from organizaciones')).rows[0].id
    await expect(como(db, u.auxiliar, `select agregar_miembro($1, 'suelto@ejemplo.co')`, [org])).rejects.toThrow(/Solo la administración/)
    await expect(como(db, u.otra, `select agregar_miembro($1, 'otra@ejemplo.co')`, [org])).rejects.toThrow(/Solo la administración/)
  })
})

describe('permisos por rol', () => {
  it('cada rol recibe los permisos de la matriz', async () => {
    const r = await como(db, u.auxiliar, `select modulo, acciones from mis_permisos($1) order by modulo`, [copro.alamos])
    expect(r.rows).toEqual([
      { modulo: 'importar', acciones: ['V', 'C'] },
      { modulo: 'perfil', acciones: ['V'] },
      { modulo: 'unidades', acciones: ['V', 'C', 'E'] },
    ])
    const p = await como(db, u.porteria, `select modulo from mis_permisos($1)`, [copro.alamos])
    expect(p.rows.map((x) => x.modulo)).toEqual(['unidades'])
  })

  it('sin acceso a la copropiedad no hay permisos', async () => {
    expect((await como(db, u.auxiliar, `select * from mis_permisos($1)`, [copro.santaElena])).rowCount).toBe(0)
    expect((await como(db, u.otra, `select * from mis_permisos($1)`, [copro.alamos])).rowCount).toBe(0)
  })
})

describe('unidades', () => {
  it('cada quien ve solo las unidades de las copropiedades a las que tiene acceso', async () => {
    expect((await como(db, u.admin, 'select * from unidades')).rowCount).toBe(3)
    expect((await como(db, u.auxiliar, 'select * from unidades')).rowCount).toBe(2)
    expect((await como(db, u.porteria, 'select * from unidades')).rowCount).toBe(2)
    expect((await como(db, u.otra, 'select * from unidades')).rowCount).toBe(1)
    expect((await como(db, u.suelto, 'select * from unidades')).rowCount).toBe(0)
  })

  it('auxiliar crea unidades; portería y consejo no', async () => {
    await como(db, u.auxiliar, `insert into unidades (copropiedad_id, torre, numero, coeficiente) values ($1, '9', '901', 1)`, [copro.alamos])
    for (const quien of ['porteria', 'consejo'] as const) {
      await expect(
        como(db, u[quien], `insert into unidades (copropiedad_id, torre, numero, coeficiente) values ($1, '9', '902', 1)`, [copro.alamos]),
      ).rejects.toThrow(/row-level security/)
    }
    await como(db, u.admin, `update unidades set activa = false where numero = '901'`)
  })

  it('nadie crea ni edita unidades de otra organización', async () => {
    await expect(
      como(db, u.otra, `insert into unidades (copropiedad_id, numero, coeficiente) values ($1, 'X', 1)`, [copro.alamos]),
    ).rejects.toThrow(/row-level security/)
    const r = await como(db, u.otra, `update unidades set coeficiente = 1 where copropiedad_id = $1`, [copro.alamos])
    expect(r.rowCount).toBe(0)
  })

  it('no se repite torre y número dentro de la copropiedad, aunque cambien mayúsculas o espacios', async () => {
    await expect(
      como(db, u.admin, `insert into unidades (copropiedad_id, torre, numero, coeficiente) values ($1, ' 1 ', '101 ', 1)`, [copro.alamos]),
    ).rejects.toThrow(/unique|duplicate/)
  })

  it('una unidad no se mueve de copropiedad y no se borra', async () => {
    await expect(
      como(db, u.admin, `update unidades set copropiedad_id = $1 where copropiedad_id = $2`, [copro.santaElena, copro.alamos]),
    ).rejects.toThrow(/no puede cambiar/)
    await expect(como(db, u.admin, `delete from unidades`)).rejects.toThrow(/permission denied/)
  })

  it('valida el coeficiente', async () => {
    await expect(
      como(db, u.admin, `insert into unidades (copropiedad_id, numero, coeficiente) values ($1, 'Z', 0)`, [copro.alamos]),
    ).rejects.toThrow(/check/)
  })

  it('suma los coeficientes de las unidades activas', async () => {
    const r = await como(db, u.auxiliar, `select * from resumen_coeficientes($1)`, [copro.alamos])
    expect(r.rows[0]).toEqual({ unidades: 2, suma: '100.000000' })
    const ajena = await como(db, u.auxiliar, `select * from resumen_coeficientes($1)`, [copro.ajena])
    expect(ajena.rows[0]).toEqual({ unidades: 0, suma: '0' })
  })
})

describe('marca', () => {
  it('cada copropiedad nace con sus datos de marca', async () => {
    const r = await como(db, u.admin, `select color_primario from marcas_copropiedad where copropiedad_id = $1`, [copro.alamos])
    expect(r.rows[0].color_primario).toBe('#1f6a4f')
  })

  it('la ven los roles con permiso y la edita solo la administración', async () => {
    expect((await como(db, u.consejo, 'select * from marcas_copropiedad')).rowCount).toBe(1)
    expect((await como(db, u.porteria, 'select * from marcas_copropiedad')).rowCount).toBe(0)
    const aux = await como(db, u.auxiliar, `update marcas_copropiedad set eslogan = 'x' where copropiedad_id = $1`, [copro.alamos])
    expect(aux.rowCount).toBe(0)
    const adm = await como(db, u.admin, `update marcas_copropiedad set color_primario = '#0c3b26', representante_legal = 'Yennifer Vargas' where copropiedad_id = $1`, [copro.alamos])
    expect(adm.rowCount).toBe(1)
  })

  it('rechaza colores inválidos', async () => {
    await expect(
      como(db, u.admin, `update marcas_copropiedad set color_primario = 'verde' where copropiedad_id = $1`, [copro.alamos]),
    ).rejects.toThrow(/check/)
  })
})

describe('importación de unidades', () => {
  it('la auxiliar no puede aprobar una importación', async () => {
    await expect(
      como(db, u.auxiliar, `select * from aplicar_importacion_unidades($1, 'u.xlsx', $2)`, [copro.alamos, JSON.stringify(filas)]),
    ).rejects.toThrow(/Solo la administración/)
  })

  it('nadie importa en una copropiedad ajena', async () => {
    await expect(
      como(db, u.otra, `select * from aplicar_importacion_unidades($1, 'u.xlsx', $2)`, [copro.alamos, JSON.stringify(filas)]),
    ).rejects.toThrow(/Solo la administración/)
  })

  it('crea, actualiza y deja igual según la llave torre + número, y registra la importación', async () => {
    const rechazos = [{ fila: 5, motivo: 'Falta el número' }]
    const r = await como(db, u.admin, `select * from aplicar_importacion_unidades($1, 'unidades.xlsx', $2, $3)`, [copro.alamos, JSON.stringify(filas), JSON.stringify(rechazos)])
    expect(r.rows[0]).toMatchObject({ total: 4, nuevas: 1, actualizadas: 1, sin_cambios: 1, rechazadas: 1, aprobado_por: u.admin })
    const unidades = await como(db, u.admin, `select torre, numero, coeficiente from unidades where copropiedad_id = $1 and activa order by torre, numero`, [copro.alamos])
    expect(unidades.rows).toEqual([
      { torre: '1', numero: '101', coeficiente: '40.000000' },
      { torre: '1', numero: '102', coeficiente: '50.000000' },
      { torre: '2', numero: '201', coeficiente: '10.000000' },
    ])
  })

  it('repetir la misma importación no duplica nada', async () => {
    const r = await como(db, u.admin, `select * from aplicar_importacion_unidades($1, 'unidades.xlsx', $2)`, [copro.alamos, JSON.stringify(filas)])
    expect(r.rows[0]).toMatchObject({ nuevas: 0, actualizadas: 0, sin_cambios: 3 })
  })

  it('es todo o nada: una fila inválida no deja cambios a medias', async () => {
    const malas = [{ torre: '3', numero: '301', coeficiente: 5 }, { torre: '3', numero: '302', coeficiente: -1 }]
    await expect(
      como(db, u.admin, `select * from aplicar_importacion_unidades($1, 'malo.xlsx', $2)`, [copro.alamos, JSON.stringify(malas)]),
    ).rejects.toThrow()
    const r = await como(db, u.admin, `select * from unidades where torre = '3'`)
    expect(r.rowCount).toBe(0)
  })

  it('el registro de importaciones lo ven la auxiliar y el revisor, no portería ni otra organización', async () => {
    expect((await como(db, u.auxiliar, 'select * from importaciones')).rowCount).toBe(2)
    expect((await como(db, u.revisor, 'select * from importaciones')).rowCount).toBe(2)
    expect((await como(db, u.porteria, 'select * from importaciones')).rowCount).toBe(0)
    expect((await como(db, u.otra, 'select * from importaciones')).rowCount).toBe(0)
  })

  it('no se puede escribir el registro de importaciones directamente', async () => {
    await expect(
      como(db, u.admin, `insert into importaciones (copropiedad_id, tipo, archivo, total, nuevas, actualizadas, sin_cambios, rechazadas, aprobado_por) values ($1, 'unidades', 'x', 0, 0, 0, 0, 0, $2)`, [copro.alamos, u.admin]),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('bitácora', () => {
  it('registra unidades e importaciones; el revisor fiscal la ve solo de su copropiedad', async () => {
    const r = await como(db, u.revisor, `select distinct entidad from bitacora order by entidad`)
    expect(r.rows.map((x) => x.entidad)).toEqual(['accesos_copropiedad', 'copropiedades', 'importaciones', 'marcas_copropiedad', 'unidades'])
    const otras = await como(db, u.revisor, `select * from bitacora where copropiedad_id <> $1 or copropiedad_id is null`, [copro.alamos])
    expect(otras.rowCount).toBe(0)
    expect((await como(db, u.auxiliar, 'select * from bitacora')).rowCount).toBe(0)
  })
})
