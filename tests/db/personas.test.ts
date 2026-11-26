import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { como, crearBaseDePrueba, crearUsuario } from './helpers'

// Sprint 3: personas vinculadas a unidades, autorización de datos (Ley 1581 de 2012),
// expediente de unidad y listado de portería, contra las políticas RLS reales.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
const u = { admin: '', auxiliar: '', consejo: '', contador: '', revisor: '', porteria: '' }
let org = ''
let copro = ''
const unidad = { a101: '', a102: '', a201: '' }
const persona = { ana: '', bruno: '', carla: '' }
let politica = ''
const OCULTO = '[dato personal]'

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  for (const k of Object.keys(u) as (keyof typeof u)[]) u[k] = await crearUsuario(db, `${k}@ejemplo.co`)
  org = (await como(db, u.admin, `select crear_organizacion('Administración de prueba') as id`)).rows[0].id
  copro = (await como(db, u.admin, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Edificio Álamos 23', 'A23') returning id`, [org])).rows[0].id
  for (const [quien, rol] of [['auxiliar', 'auxiliar'], ['consejo', 'consejo'], ['contador', 'contador'], ['revisor', 'revisor_fiscal'], ['porteria', 'porteria']] as const) {
    await db.query(`insert into miembros_organizacion (organizacion_id, usuario_id) values ($1, $2)`, [org, u[quien]])
    await db.query(`insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, $3)`, [copro, u[quien], rol])
  }
  const crearUnidad = (numero: string, coef: number) =>
    como(db, u.admin, `insert into unidades (copropiedad_id, numero, coeficiente) values ($1, $2, $3) returning id`, [copro, numero, coef]).then((r) => r.rows[0].id as string)
  unidad.a101 = await crearUnidad('101', 40)
  unidad.a102 = await crearUnidad('102', 30)
  unidad.a201 = await crearUnidad('201', 30)
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const registrar = (quien: string, nombre: string, doc?: string, extra: { correo?: string; celular?: string } = {}) =>
  como(db, quien, `select registrar_persona($1, $2, 'natural', $3, $4, $5, $6) as id`, [
    copro,
    nombre,
    doc ? 'CC' : null,
    doc ?? null,
    extra.correo ?? null,
    extra.celular ?? null,
  ]).then((r) => r.rows[0].id as string)

describe('registro de personas', () => {
  it('la administración registra una persona con sus datos en un paso', async () => {
    persona.ana = await registrar(u.admin, '  Ana   María Pérez ', '52.123.456', { correo: 'Ana.Perez@Ejemplo.co', celular: '300 123 4567' })
    const r = await como(db, u.admin, `select p.nombre, d.numero_documento, d.correo, d.celular from personas p join personas_datos d on d.persona_id = p.id where p.id = $1`, [persona.ana])
    expect(r.rows[0]).toEqual({ nombre: 'Ana María Pérez', numero_documento: '52123456', correo: 'ana.perez@ejemplo.co', celular: '3001234567' })
  })

  it('la auxiliar también registra personas', async () => {
    persona.bruno = await registrar(u.auxiliar, 'Bruno Díaz', '79111222', { celular: '3109998877' })
    persona.carla = await registrar(u.auxiliar, 'Carla Gómez')
    expect(persona.carla).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('el mismo documento no se registra dos veces (registrar una vez)', async () => {
    await expect(registrar(u.admin, 'Ana Pérez (repetida)', '52123456')).rejects.toThrow(/Ya existe una persona con ese documento/)
    await expect(
      como(db, u.admin, `insert into personas_datos (persona_id, copropiedad_id, tipo_documento, numero_documento) values ($1, $2, 'CC', '52123456')`, [persona.carla, copro]),
    ).rejects.toThrow(/unique|duplicate/)
  })

  it('consejo, contador, revisor fiscal y portería no registran personas', async () => {
    for (const quien of [u.consejo, u.contador, u.revisor, u.porteria]) {
      await expect(registrar(quien, 'Intrusa')).rejects.toThrow(/permiso/)
      await expect(como(db, quien, `insert into personas (copropiedad_id, nombre) values ($1, 'Intrusa')`, [copro])).rejects.toThrow(/row-level security/)
    }
  })

  it('insert … returning funciona con las políticas (usan columnas de la fila)', async () => {
    const r = await como(db, u.auxiliar, `insert into personas (copropiedad_id, nombre) values ($1, 'Diego Ruiz') returning id, nombre`, [copro])
    expect(r.rows[0].nombre).toBe('Diego Ruiz')
    const d = await como(db, u.auxiliar, `insert into personas_datos (persona_id, copropiedad_id, correo) values ($1, $2, 'diego@ejemplo.co') returning persona_id`, [r.rows[0].id, copro])
    expect(d.rows[0].persona_id).toBe(r.rows[0].id)
  })

  it('quien registra queda anotado aunque intente poner a otra persona', async () => {
    const r = await como(db, u.auxiliar, `select creado_por from personas where id = $1`, [persona.bruno])
    expect(r.rows[0].creado_por).toBe(u.auxiliar)
  })

  it('las personas no se borran', async () => {
    await expect(como(db, u.admin, `delete from personas where id = $1`, [persona.carla])).rejects.toThrow(/permission denied/)
  })
})

describe('datos personales solo para quien los necesita', () => {
  it('consejo, contador y revisor fiscal ven los nombres pero no documento ni contacto', async () => {
    for (const quien of [u.consejo, u.contador, u.revisor]) {
      expect((await como(db, quien, `select nombre from personas where id = $1`, [persona.ana])).rows).toEqual([{ nombre: 'Ana María Pérez' }])
      expect((await como(db, quien, `select * from personas_datos`)).rowCount).toBe(0)
    }
  })

  it('la auxiliar sí ve los datos de contacto', async () => {
    expect((await como(db, u.auxiliar, `select correo from personas_datos where persona_id = $1`, [persona.ana])).rows).toEqual([{ correo: 'ana.perez@ejemplo.co' }])
  })

  it('consejo no puede registrar datos de contacto ni con la función', async () => {
    await expect(
      como(db, u.consejo, `update personas_datos set correo = 'x@ejemplo.co' where persona_id = $1 returning persona_id`, [persona.ana]),
    ).resolves.toMatchObject({ rowCount: 0 })
  })
})

describe('vínculos con unidades', () => {
  it('una persona se vincula a varias unidades y cada unidad tiene su titular', async () => {
    await como(db, u.admin, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo, es_titular, reside, desde) values ($1, $2, $3, 'propietario', true, true, '2020-01-15')`, [copro, unidad.a101, persona.ana])
    await como(db, u.admin, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo, es_titular, desde) values ($1, $2, $3, 'propietario', true, '2021-06-01')`, [copro, unidad.a102, persona.ana])
    await como(db, u.auxiliar, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo, reside, desde) values ($1, $2, $3, 'arrendatario', true, '2024-03-01')`, [copro, unidad.a102, persona.bruno])
    await como(db, u.auxiliar, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo) values ($1, $2, $3, 'autorizado')`, [copro, unidad.a102, persona.carla])
    const r = await como(db, u.consejo, `select count(*)::int as n from vinculos_unidad where persona_id = $1`, [persona.ana])
    expect(r.rows[0].n).toBe(2)
  })

  it('una unidad no tiene dos titulares vigentes', async () => {
    await expect(
      como(db, u.admin, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo, es_titular) values ($1, $2, $3, 'propietario', true)`, [copro, unidad.a101, persona.bruno]),
    ).rejects.toThrow(/unique|duplicate/)
  })

  it('solo un propietario puede ser titular', async () => {
    await expect(
      como(db, u.admin, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo, es_titular) values ($1, $2, $3, 'residente', true)`, [copro, unidad.a201, persona.carla]),
    ).rejects.toThrow(/check/)
  })

  it('la fecha de fin no puede ser anterior a la de inicio', async () => {
    await expect(
      como(db, u.admin, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo, desde, hasta) values ($1, $2, $3, 'residente', '2024-05-01', '2024-01-01')`, [copro, unidad.a201, persona.carla]),
    ).rejects.toThrow(/check/)
  })

  it('un vínculo no cambia de unidad, persona ni tipo', async () => {
    const id = (await como(db, u.admin, `select id from vinculos_unidad where persona_id = $1 and tipo = 'arrendatario'`, [persona.bruno])).rows[0].id
    await expect(como(db, u.admin, `update vinculos_unidad set unidad_id = $1 where id = $2`, [unidad.a201, id])).rejects.toThrow(/permission denied/)
    await expect(db.query(`update vinculos_unidad set tipo = 'propietario' where id = $1`, [id])).rejects.toThrow(/no cambia de unidad/)
  })

  it('consejo y contador no crean ni terminan vínculos', async () => {
    await expect(
      como(db, u.consejo, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo) values ($1, $2, $3, 'residente')`, [copro, unidad.a201, persona.carla]),
    ).rejects.toThrow(/row-level security/)
    const r = await como(db, u.contador, `update vinculos_unidad set hasta = current_date where persona_id = $1`, [persona.ana])
    expect(r.rowCount).toBe(0)
  })
})

describe('autorización de datos (Ley 1581)', () => {
  it('sin la aprobación de la administración no se publica una política', async () => {
    await expect(
      como(db, u.auxiliar, `insert into politicas_tratamiento (copropiedad_id, version, vigente_desde, meses_conservacion, texto) values ($1, '1.0', '2026-01-01', 60, $2)`, [copro, 'x'.repeat(60)]),
    ).rejects.toThrow(/row-level security/)
  })

  it('la administración publica la versión de la política con su plazo de conservación', async () => {
    const r = await como(db, u.admin, `insert into politicas_tratamiento (copropiedad_id, version, vigente_desde, meses_conservacion, texto) values ($1, '1.0', '2026-01-01', 60, $2) returning id, creado_por`, [
      copro,
      'Política de tratamiento de datos personales de la copropiedad. '.repeat(2),
    ])
    politica = r.rows[0].id
    expect(r.rows[0].creado_por).toBe(u.admin)
    await expect(como(db, u.admin, `update politicas_tratamiento set meses_conservacion = 1 where id = $1`, [politica])).rejects.toThrow(/permission denied/)
  })

  it('la autorización guarda fecha, canal, versión, finalidades y quién la registró', async () => {
    const r = await como(db, u.auxiliar, `insert into autorizaciones_datos (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades) values ($1, $2, $3, 'escrito', '2026-02-10', '{seguridad,administracion,administracion}') returning *`, [
      copro,
      persona.ana,
      politica,
    ])
    expect(r.rows[0]).toMatchObject({ canal: 'escrito', finalidades: ['administracion', 'seguridad'], registrada_por: u.auxiliar, revocada_en: null })
  })

  it('nadie pone a otra persona como quien registró la autorización', async () => {
    await expect(
      como(db, u.auxiliar, `insert into autorizaciones_datos (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades, registrada_por) values ($1, $2, $3, 'escrito', '2026-02-10', '{administracion}', $4)`, [copro, persona.bruno, politica, u.admin]),
    ).rejects.toThrow(/permission denied/)
  })

  it('no se registra una autorización con fecha futura ni con finalidades desconocidas', async () => {
    await expect(
      como(db, u.admin, `insert into autorizaciones_datos (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades) values ($1, $2, $3, 'correo', current_date + 1, '{administracion}')`, [copro, persona.bruno, politica]),
    ).rejects.toThrow(/futura/)
    await expect(
      como(db, u.admin, `insert into autorizaciones_datos (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades) values ($1, $2, $3, 'correo', '2026-01-02', '{mercadeo}')`, [copro, persona.bruno, politica]),
    ).rejects.toThrow(/check/)
  })

  it('una autorización no se modifica; solo se revoca, una vez y sin deshacer', async () => {
    const id = (await como(db, u.admin, `select id from autorizaciones_datos where persona_id = $1`, [persona.ana])).rows[0].id
    await expect(como(db, u.admin, `update autorizaciones_datos set canal = 'correo' where id = $1`, [id])).rejects.toThrow(/permission denied/)
    const r = await como(db, u.auxiliar, `update autorizaciones_datos set revocada_en = '2026-03-01', revocacion_canal = 'correo' where id = $1 returning revocada_por, revocacion_registrada_en`, [id])
    expect(r.rows[0].revocada_por).toBe(u.auxiliar)
    expect(r.rows[0].revocacion_registrada_en).not.toBeNull()
    await expect(como(db, u.admin, `update autorizaciones_datos set revocada_en = '2026-03-02', revocacion_canal = 'escrito' where id = $1`, [id])).rejects.toThrow(/ya fue revocada/)
  })

  it('consejo ve si hay autorización pero no la registra ni la revoca', async () => {
    expect((await como(db, u.consejo, `select canal from autorizaciones_datos`)).rowCount).toBe(1)
    await expect(
      como(db, u.consejo, `insert into autorizaciones_datos (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades) values ($1, $2, $3, 'escrito', '2026-01-02', '{administracion}')`, [copro, persona.bruno, politica]),
    ).rejects.toThrow(/row-level security/)
  })

  it('al terminar el último vínculo se calcula hasta cuándo se conservan los datos', async () => {
    await como(db, u.admin, `update vinculos_unidad set hasta = '2026-06-30' where persona_id = $1`, [persona.bruno])
    expect((await como(db, u.admin, `select conservar_hasta::text as f from personas where id = $1`, [persona.bruno])).rows[0].f).toBe('2031-06-30')
    // Con un vínculo abierto no hay plazo.
    expect((await como(db, u.admin, `select conservar_hasta from personas where id = $1`, [persona.ana])).rows[0].conservar_hasta).toBeNull()
    // Nadie fija el plazo a mano.
    await expect(como(db, u.admin, `update personas set conservar_hasta = '2099-01-01' where id = $1`, [persona.ana])).rejects.toThrow(/permission denied/)
  })
})

describe('portería', () => {
  it('no lee personas, datos, vínculos, autorizaciones ni políticas', async () => {
    for (const t of ['personas', 'personas_datos', 'vinculos_unidad', 'autorizaciones_datos', 'politicas_tratamiento']) {
      expect((await como(db, u.porteria, `select * from ${t}`)).rowCount, t).toBe(0)
    }
  })

  it('recibe solo nombres de residentes y autorizados vigentes, con su unidad', async () => {
    const r = await como(db, u.porteria, `select * from residentes_porteria($1)`, [copro])
    expect(r.fields.map((f) => f.name)).toEqual(['unidad_id', 'torre', 'numero', 'nombre', 'vinculo'])
    expect(r.rows.map((x) => `${x.numero} ${x.nombre} ${x.vinculo}`)).toEqual(['101 Ana María Pérez propietario', '102 Carla Gómez autorizado'])
    // Ni documento, ni correo, ni celular en ninguna parte de la respuesta.
    expect(JSON.stringify(r.rows)).not.toMatch(/52123456|ejemplo\.co|300123|310999/)
  })

  it('el propietario que no vive en la unidad y el arrendatario que se fue no aparecen', async () => {
    const r = await como(db, u.porteria, `select nombre from residentes_porteria($1) where numero = '102'`, [copro])
    expect(r.rows.map((x) => x.nombre)).toEqual(['Carla Gómez'])
  })

  it('una persona inactiva deja de aparecer', async () => {
    await como(db, u.admin, `update personas set activa = false where id = $1`, [persona.carla])
    expect((await como(db, u.porteria, `select nombre from residentes_porteria($1)`, [copro])).rows.map((x) => x.nombre)).toEqual(['Ana María Pérez'])
    await como(db, u.admin, `update personas set activa = true where id = $1`, [persona.carla])
  })

  it('consejo y contador no tienen el listado de portería', async () => {
    await expect(como(db, u.consejo, `select * from residentes_porteria($1)`, [copro])).rejects.toThrow(/permiso/)
    await expect(como(db, u.contador, `select * from residentes_porteria($1)`, [copro])).rejects.toThrow(/permiso/)
  })

  it('portería no abre el expediente de la unidad', async () => {
    await expect(como(db, u.porteria, `select * from historial_unidad($1)`, [unidad.a101])).rejects.toThrow(/permiso/)
  })
})

describe('expediente de unidad y bitácora', () => {
  it('el historial de la unidad sale de la bitácora, con autor y sin datos personales', async () => {
    const r = await como(db, u.consejo, `select accion, entidad, tipo, autor from historial_unidad($1) order by creado_en`, [unidad.a102])
    expect(r.rows.map((x) => `${x.accion} ${x.entidad} ${x.tipo ?? ''}`.trim())).toEqual([
      'insert unidades',
      'insert vinculos_unidad propietario',
      'insert vinculos_unidad arrendatario',
      'insert vinculos_unidad autorizado',
      'update vinculos_unidad arrendatario',
    ])
    expect(r.rows[0].autor).toBe('admin')
    expect(JSON.stringify(r.rows)).not.toMatch(/Bruno|Ana|Carla/)
  })

  it('nombre, documento, correo y celular quedan enmascarados en la bitácora', async () => {
    const r = await db.query(`select entidad, datos from bitacora where entidad in ('personas', 'personas_datos', 'politicas_tratamiento')`)
    const texto = JSON.stringify(r.rows)
    expect(texto).not.toMatch(/Ana María|Bruno|52123456|79111222|ana\.perez|3001234567|Política de tratamiento/)
    const p = r.rows.find((x) => x.entidad === 'personas')
    expect(p.datos.nombre).toBe(OCULTO)
    const d = r.rows.find((x) => x.entidad === 'personas_datos' && x.datos.numero_documento)
    expect(d.datos).toMatchObject({ numero_documento: OCULTO, correo: OCULTO, celular: OCULTO, tipo_documento: 'CC' })
  })

  it('la entrada de los datos de una persona apunta a la persona', async () => {
    const r = await db.query(`select entidad_id from bitacora where entidad = 'personas_datos' and accion = 'insert' order by id limit 1`)
    expect(r.rows[0].entidad_id).toBe(persona.ana)
  })
})
