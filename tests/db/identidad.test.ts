import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { calcularDv } from '@/lib/identidad'
import { como, crearBaseDePrueba, crearUsuario } from './helpers'

// Identidad de cada copropiedad: NIT con dígito de verificación, nombre completo,
// celular, edición solo por la administración, bitácora y logos en el bucket privado.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
const u = { dueno: '', adminCopro: '', auxiliar: '', consejo: '', porteria: '', otra: '' }
const copro = { alamos: '', santaElena: '', ajena: '' }

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  for (const k of Object.keys(u) as (keyof typeof u)[]) u[k] = await crearUsuario(db, `${k}@ejemplo.co`)

  const org = (await como(db, u.dueno, `select crear_organizacion('Administración de prueba', '900123456-8') as id`)).rows[0].id
  const orgB = (await como(db, u.otra, `select crear_organizacion('Otra') as id`)).rows[0].id
  const crear = (usuario: string, o: string, nombre: string, prefijo: string, nit: string | null) =>
    como(db, usuario, `insert into copropiedades (organizacion_id, nombre, prefijo, nit) values ($1, $2, $3, $4) returning id`, [o, nombre, prefijo, nit]).then(
      (r) => r.rows[0].id as string,
    )
  copro.alamos = await crear(u.dueno, org, 'Edificio Álamos 23', 'A23', '800197268-4')
  copro.santaElena = await crear(u.dueno, org, 'Urbanización Santa Elena', 'SE', null)
  copro.ajena = await crear(u.otra, orgB, 'Ajena', 'AJ', '860034313-7')

  // La administradora de la copropiedad NO es administradora de la organización.
  for (const [quien, rol] of [['adminCopro', 'administradora'], ['auxiliar', 'auxiliar'], ['consejo', 'consejo'], ['porteria', 'porteria']] as const) {
    await como(db, u.dueno, `select agregar_miembro($1, $2)`, [org, `${quien}@ejemplo.co`])
    await como(db, u.dueno, `insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, $3)`, [copro.alamos, u[quien], rol])
  }
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const identidad = (c: string, nit: string | null, extra: Record<string, string> = {}) => ({
  sql: `select guardar_identidad($1, $2, $3, $4, $5, $6) as r`,
  params: [c, extra.nombre ?? 'Edificio Álamos 23 Propiedad Horizontal', nit, extra.celular ?? '+57 300 123 4567', extra.representante ?? 'Yennifer Vargas', extra.correo ?? 'admin@alamos.co'],
})

describe('NIT con dígito de verificación', () => {
  it('app.nit_dv_valido coincide con el cálculo de la aplicación', async () => {
    const numeros = Array.from({ length: 150 }, (_, i) => String(800000000 + i * 7919 + (i % 13) * 104729))
    const r = await db.query<{ n: string; dv: number }>(
      `select n, (select d from generate_series(0, 9) d where app.nit_dv_valido(n || '-' || d)) as dv from unnest($1::text[]) n`,
      [numeros],
    )
    for (const fila of r.rows) expect(fila.dv, fila.n).toBe(calcularDv(fila.n))
    expect((await db.query(`select app.nit_dv_valido('900123456-8') a, app.nit_dv_valido('900123456-7') b, app.nit_dv_valido('x') c, app.nit_dv_valido(null) d`)).rows[0]).toEqual({
      a: true,
      b: false,
      c: false,
      d: null,
    })
  })

  it('una copropiedad no se crea ni se edita con un dígito equivocado', async () => {
    const org = (await como(db, u.dueno, 'select id from organizaciones')).rows[0].id
    await expect(
      como(db, u.dueno, `insert into copropiedades (organizacion_id, nombre, prefijo, nit) values ($1, 'Mal NIT', 'MN', '900123456-7')`, [org]),
    ).rejects.toThrow(/copropiedades_nit_dv/)
    await expect(como(db, u.dueno, `update copropiedades set nit = '800197268-5' where id = $1`, [copro.alamos])).rejects.toThrow(/copropiedades_nit_dv/)
  })

  it('tampoco una organización', async () => {
    await expect(como(db, u.porteria, `select crear_organizacion('Mala', '900123456-1')`)).rejects.toThrow(/organizaciones_nit_dv/)
  })
})

describe('nombre completo y celular', () => {
  it('el celular se guarda normalizado y se valida', async () => {
    const r = await como(db, u.dueno, `update marcas_copropiedad set celular = '+57 (315) 555-1234' where copropiedad_id = $1 returning celular`, [copro.santaElena])
    expect(r.rows[0].celular).toBe('3155551234')
    for (const malo of ['601 123 4567', '30012345', '300abc4567']) {
      await expect(como(db, u.dueno, `update marcas_copropiedad set celular = $2 where copropiedad_id = $1`, [copro.santaElena, malo])).rejects.toThrow(/marcas_celular_formato/)
    }
  })

  it('el nombre completo se normaliza y respeta su largo', async () => {
    const r = await como(db, u.dueno, `update marcas_copropiedad set nombre_legal = '  Urbanización   Santa Elena PH ' where copropiedad_id = $1 returning nombre_legal`, [copro.santaElena])
    expect(r.rows[0].nombre_legal).toBe('Urbanización Santa Elena PH')
    await expect(como(db, u.dueno, `update marcas_copropiedad set nombre_legal = 'PH' where copropiedad_id = $1`, [copro.santaElena])).rejects.toThrow(/marcas_nombre_legal_largo/)
  })
})

describe('quién cambia la identidad', () => {
  it('la administradora de la copropiedad cambia nombre completo, NIT y celular', async () => {
    const q = identidad(copro.alamos, '900123456-8')
    await como(db, u.adminCopro, q.sql, q.params)
    const c = await como(db, u.adminCopro, `select c.nit, m.nombre_legal, m.celular, m.representante_legal, m.actualizado_por from copropiedades c join marcas_copropiedad m on m.copropiedad_id = c.id where c.id = $1`, [copro.alamos])
    expect(c.rows[0]).toEqual({
      nit: '900123456-8',
      nombre_legal: 'Edificio Álamos 23 Propiedad Horizontal',
      celular: '3001234567',
      representante_legal: 'Yennifer Vargas',
      actualizado_por: u.adminCopro,
    })
  })

  it('pero no puede editar la copropiedad directamente (solo a través de la identidad)', async () => {
    const r = await como(db, u.adminCopro, `update copropiedades set nombre = 'Otro' where id = $1`, [copro.alamos])
    expect(r.rowCount).toBe(0)
  })

  it('la función también exige el dígito de verificación', async () => {
    const q = identidad(copro.alamos, '900123456-7')
    await expect(como(db, u.adminCopro, q.sql, q.params)).rejects.toThrow(/copropiedades_nit_dv/)
  })

  it('auxiliar, consejo y portería no pueden cambiarla', async () => {
    for (const quien of ['auxiliar', 'consejo', 'porteria'] as const) {
      const q = identidad(copro.alamos, '800197268-4')
      await expect(como(db, u[quien], q.sql, q.params), quien).rejects.toThrow(/Solo la administración/)
    }
    const nombres = await como(db, u.auxiliar, `update marcas_copropiedad set nombre_legal = 'Edificio pirata' where copropiedad_id = $1`, [copro.alamos])
    expect(nombres.rowCount).toBe(0)
  })

  it('nadie cambia la identidad de una copropiedad a la que no pertenece', async () => {
    const enSantaElena = identidad(copro.santaElena, '800197268-4')
    await expect(como(db, u.adminCopro, enSantaElena.sql, enSantaElena.params)).rejects.toThrow(/Solo la administración/)
    const deOtra = identidad(copro.alamos, '860034313-7')
    await expect(como(db, u.otra, deOtra.sql, deOtra.params)).rejects.toThrow(/Solo la administración/)
    const ajena = identidad(copro.ajena, '800197268-4')
    await expect(como(db, u.dueno, ajena.sql, ajena.params)).rejects.toThrow(/Solo la administración/)
    await expect(como(db, null, enSantaElena.sql, enSantaElena.params)).rejects.toThrow(/permission denied/)
    const nit = await db.query(`select nit from copropiedades where id = $1`, [copro.ajena])
    expect(nit.rows[0].nit).toBe('860034313-7')
  })

  it('el consejo ve la identidad; portería no', async () => {
    expect((await como(db, u.consejo, `select nombre_legal, celular from marcas_copropiedad`)).rows).toEqual([
      { nombre_legal: 'Edificio Álamos 23 Propiedad Horizontal', celular: '3001234567' },
    ])
    expect((await como(db, u.porteria, `select * from marcas_copropiedad`)).rowCount).toBe(0)
  })
})

describe('bitácora de la identidad', () => {
  it('registra quién cambió el NIT, cuándo, y el antes y el después', async () => {
    const r = await como(db, u.dueno, `
      select usuario_id, datos -> 'antes' ->> 'nit' as antes, datos -> 'despues' ->> 'nit' as despues, creado_en
      from bitacora where entidad = 'copropiedades' and accion = 'update' and entidad_id = $1`, [copro.alamos])
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ usuario_id: u.adminCopro, antes: '800197268-4', despues: '900123456-8' })
    expect(r.rows[0].creado_en).toBeInstanceOf(Date)
  })

  it('registra los cambios de nombre completo y celular', async () => {
    const r = await como(db, u.dueno, `
      select datos -> 'despues' ->> 'nombre_legal' as nombre, datos -> 'despues' ->> 'celular' as celular
      from bitacora where entidad = 'marcas_copropiedad' and usuario_id = $1`, [u.adminCopro])
    expect(r.rows).toContainEqual({ nombre: 'Edificio Álamos 23 Propiedad Horizontal', celular: '3001234567' })
  })
})

describe('logos en el bucket privado "marcas"', () => {
  const subir = (usuario: string | null, nombre: string) =>
    como(db, usuario, `insert into storage.objects (bucket_id, name, metadata) values ('marcas', $1, '{"mimetype":"image/png"}') returning name`, [nombre])

  it('el bucket es privado, limitado a 2 MB e imágenes', async () => {
    const r = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'marcas'`)
    expect(r.rows[0]).toEqual({ public: false, file_size_limit: '2097152', allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] })
  })

  it('la administración sube el logo en la carpeta de su copropiedad', async () => {
    await subir(u.adminCopro, `${copro.alamos}/logo.png`)
    await subir(u.dueno, `${copro.santaElena}/logo.svg`)
    const r = await como(db, u.adminCopro, `update marcas_copropiedad set logo_ruta = $2 where copropiedad_id = $1 returning logo_ruta`, [copro.alamos, `${copro.alamos}/logo.png`])
    expect(r.rows[0].logo_ruta).toBe(`${copro.alamos}/logo.png`)
  })

  it('otros roles, otras copropiedades y otras rutas no pueden escribir', async () => {
    await expect(subir(u.auxiliar, `${copro.alamos}/logo.jpg`)).rejects.toThrow(/row-level security/)
    await expect(subir(u.consejo, `${copro.alamos}/logo.jpg`)).rejects.toThrow(/row-level security/)
    await expect(subir(u.adminCopro, `${copro.santaElena}/logo.png`)).rejects.toThrow(/row-level security/)
    await expect(subir(u.otra, `${copro.alamos}/logo.webp`)).rejects.toThrow(/row-level security/)
    await expect(subir(u.adminCopro, `${copro.alamos}/otro.png`)).rejects.toThrow(/row-level security/)
    await expect(subir(u.adminCopro, `${copro.alamos}/../${copro.santaElena}/logo.png`)).rejects.toThrow(/row-level security/)
    await expect(subir(null, `${copro.alamos}/logo.jpg`)).rejects.toThrow(/permission denied/)
  })

  it('leen el logo quienes ven la identidad, y solo de sus copropiedades', async () => {
    const ver = (usuario: string) => como(db, usuario, `select name from storage.objects where bucket_id = 'marcas' order by name`).then((r) => r.rows.map((x) => x.name))
    expect(await ver(u.consejo)).toEqual([`${copro.alamos}/logo.png`])
    expect(await ver(u.auxiliar)).toEqual([`${copro.alamos}/logo.png`])
    expect(await ver(u.porteria)).toEqual([])
    expect(await ver(u.otra)).toEqual([])
    expect((await ver(u.dueno)).sort()).toEqual([`${copro.alamos}/logo.png`, `${copro.santaElena}/logo.svg`].sort())
  })

  it('solo la administración reemplaza o borra el logo', async () => {
    const cambio = await como(db, u.auxiliar, `update storage.objects set metadata = '{}' where name = $1`, [`${copro.alamos}/logo.png`])
    expect(cambio.rowCount).toBe(0)
    const borrado = await como(db, u.otra, `delete from storage.objects where name = $1`, [`${copro.alamos}/logo.png`])
    expect(borrado.rowCount).toBe(0)
    const propio = await como(db, u.dueno, `delete from storage.objects where name = $1`, [`${copro.santaElena}/logo.svg`])
    expect(propio.rowCount).toBe(1)
  })

  it('el logo de una copropiedad no puede apuntar a la carpeta de otra', async () => {
    await expect(
      como(db, u.dueno, `update marcas_copropiedad set logo_ruta = $2 where copropiedad_id = $1`, [copro.alamos, `${copro.santaElena}/logo.png`]),
    ).rejects.toThrow(/marcas_logo_ruta_propia/)
  })
})
