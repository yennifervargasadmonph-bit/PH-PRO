import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { como, crearBaseDePrueba, crearUsuario, unirAOrganizacion } from './helpers'

// Pruebas automáticas de fuga entre organizaciones y copropiedades.
// Corren contra un PostgreSQL real con las mismas políticas RLS de producción.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
const u = { admin: '', asistente: '', otraOrg: '', sinOrg: '' }
const org = { a: '', b: '' }
const copro = { alamos: '', santaElena: '', ajena: '' }

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  u.admin = await crearUsuario(db, 'administradora@ejemplo.co')
  u.asistente = await crearUsuario(db, 'asistente@ejemplo.co')
  u.otraOrg = await crearUsuario(db, 'otra@ejemplo.co')
  u.sinOrg = await crearUsuario(db, 'nueva@ejemplo.co')

  org.a = (await como(db, u.admin, `select crear_organizacion('Administración de prueba', '900123456-8') as id`)).rows[0].id
  org.b = (await como(db, u.otraOrg, `select crear_organizacion('Otra administradora') as id`)).rows[0].id

  const crear = (usuario: string, o: string, nombre: string, prefijo: string) =>
    como(db, usuario, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, $2, $3) returning id`, [o, nombre, prefijo]).then((r) => r.rows[0].id as string)
  copro.alamos = await crear(u.admin, org.a, 'Edificio Álamos 23', 'A23')
  copro.santaElena = await crear(u.admin, org.a, 'Urbanización Santa Elena', 'SE')
  copro.ajena = await crear(u.otraOrg, org.b, 'Copropiedad ajena', 'AJ')

  await unirAOrganizacion(db, u.admin, org.a, u.asistente)
  await como(db, u.admin, `insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, 'auxiliar')`, [copro.alamos, u.asistente])
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const nombres = (r: pg.QueryResult) => r.rows.map((x) => x.nombre).sort()

describe('organizaciones', () => {
  it('quien crea una organización queda como propietario', async () => {
    const r = await como(db, u.admin, `select rol from miembros_organizacion where organizacion_id = $1 and usuario_id = $2`, [org.a, u.admin])
    expect(r.rows[0].rol).toBe('propietario')
  })

  it('cada usuario ve solo su organización', async () => {
    expect(nombres(await como(db, u.admin, 'select nombre from organizaciones'))).toEqual(['Administración de prueba'])
    expect(nombres(await como(db, u.otraOrg, 'select nombre from organizaciones'))).toEqual(['Otra administradora'])
    expect((await como(db, u.sinOrg, 'select * from organizaciones')).rowCount).toBe(0)
  })

  it('no se puede insertar una organización directamente', async () => {
    await expect(como(db, u.sinOrg, `insert into organizaciones (nombre) values ('Atajo')`)).rejects.toThrow()
  })

  it('un visitante sin sesión no ve nada ni puede crear organizaciones', async () => {
    await expect(como(db, null, 'select * from organizaciones')).rejects.toThrow(/permission denied/)
    await expect(como(db, null, `select crear_organizacion('X')`)).rejects.toThrow(/permission denied/)
  })

  it('nadie se agrega solo a una organización ajena', async () => {
    await expect(
      como(db, u.otraOrg, `insert into miembros_organizacion (organizacion_id, usuario_id, rol) values ($1, $2, 'administrador')`, [org.a, u.otraOrg]),
    ).rejects.toThrow(/permission denied/)
  })

  it('ni la administración inserta miembros directamente (solo por invitación aceptada)', async () => {
    await expect(
      como(db, u.admin, `insert into miembros_organizacion (organizacion_id, usuario_id, rol) values ($1, $2, 'miembro')`, [org.a, u.sinOrg]),
    ).rejects.toThrow(/permission denied/)
  })

  it('un administrador no puede crear ni quitar propietarios', async () => {
    await expect(como(db, u.admin, `select invitar_persona($1, 'nueva@ejemplo.co', 'propietario')`, [org.a])).rejects.toThrow(/propietario/)
    const r = await como(db, u.admin, `delete from miembros_organizacion where usuario_id = $1`, [u.admin])
    expect(r.rowCount).toBe(0)
  })
})

describe('copropiedades', () => {
  it('la administradora ve todas las copropiedades de su organización y ninguna ajena', async () => {
    expect(nombres(await como(db, u.admin, 'select nombre from copropiedades'))).toEqual(['Edificio Álamos 23', 'Urbanización Santa Elena'])
  })

  it('la otra organización no ve las copropiedades piloto', async () => {
    expect(nombres(await como(db, u.otraOrg, 'select nombre from copropiedades'))).toEqual(['Copropiedad ajena'])
    const r = await como(db, u.otraOrg, 'select * from copropiedades where id = $1', [copro.alamos])
    expect(r.rowCount).toBe(0)
  })

  it('la asistente ve solo la copropiedad que tiene asignada', async () => {
    expect(nombres(await como(db, u.asistente, 'select nombre from copropiedades'))).toEqual(['Edificio Álamos 23'])
  })

  it('la asistente no puede crear copropiedades', async () => {
    await expect(
      como(db, u.asistente, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Nueva', 'NV')`, [org.a]),
    ).rejects.toThrow(/row-level security/)
  })

  it('nadie crea copropiedades en una organización ajena', async () => {
    await expect(
      como(db, u.otraOrg, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Intrusa', 'IN')`, [org.a]),
    ).rejects.toThrow(/row-level security/)
  })

  it('nadie edita una copropiedad ajena', async () => {
    const r = await como(db, u.otraOrg, `update copropiedades set nombre = 'Hackeada' where id = $1`, [copro.alamos])
    expect(r.rowCount).toBe(0)
    const ok = await como(db, u.admin, 'select nombre from copropiedades where id = $1', [copro.alamos])
    expect(ok.rows[0].nombre).toBe('Edificio Álamos 23')
  })

  it('una copropiedad no se puede mover a otra organización', async () => {
    await expect(
      como(db, u.admin, `update copropiedades set organizacion_id = $1 where id = $2`, [org.b, copro.alamos]),
    ).rejects.toThrow()
  })

  it('las copropiedades no se borran (se desactivan)', async () => {
    await expect(como(db, u.admin, 'delete from copropiedades where id = $1', [copro.santaElena])).rejects.toThrow(/permission denied/)
  })

  it('el prefijo documental es único dentro de la organización', async () => {
    await expect(
      como(db, u.admin, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Repetida', 'A23')`, [org.a]),
    ).rejects.toThrow(/unique|duplicate/)
  })
})

describe('accesos', () => {
  it('solo se da acceso a miembros de la misma organización', async () => {
    await expect(
      como(db, u.admin, `insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, 'consejo')`, [copro.alamos, u.otraOrg]),
    ).rejects.toThrow(/row-level security/)
  })

  it('la asistente ve su acceso pero no los de otros', async () => {
    const r = await como(db, u.asistente, 'select usuario_id from accesos_copropiedad')
    expect(r.rows.map((x) => x.usuario_id)).toEqual([u.asistente])
  })

  it('la asistente no puede darse más accesos', async () => {
    await expect(
      como(db, u.asistente, `insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, 'administradora')`, [copro.santaElena, u.asistente]),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('perfiles', () => {
  it('se crea un perfil al registrarse', async () => {
    const r = await db.query('select correo from perfiles where id = $1', [u.sinOrg])
    expect(r.rows[0].correo).toBe('nueva@ejemplo.co')
  })

  it('se ven los perfiles de la propia organización y no los de otras', async () => {
    const r = await como(db, u.admin, 'select correo from perfiles order by correo')
    expect(r.rows.map((x) => x.correo)).toEqual(['administradora@ejemplo.co', 'asistente@ejemplo.co'])
  })

  it('cada quien cambia su nombre, pero no su correo', async () => {
    const r = await como(db, u.asistente, `update perfiles set nombre = 'Asistente Uno' where id = $1`, [u.asistente])
    expect(r.rowCount).toBe(1)
    await expect(como(db, u.asistente, `update perfiles set correo = 'administradora@ejemplo.co' where id = $1`, [u.asistente])).rejects.toThrow(
      /permission denied/,
    )
  })

  it('el correo del perfil sigue al de la cuenta', async () => {
    await db.query(`update auth.users set email = 'Nueva.Direccion@ejemplo.co' where id = $1`, [u.sinOrg])
    expect((await db.query('select correo from perfiles where id = $1', [u.sinOrg])).rows[0].correo).toBe('Nueva.Direccion@ejemplo.co')
    await db.query(`update auth.users set email = 'nueva@ejemplo.co' where id = $1`, [u.sinOrg])
  })

  it('nadie edita el perfil de otra persona', async () => {
    const r = await como(db, u.admin, `update perfiles set nombre = 'Otro' where id = $1`, [u.asistente])
    expect(r.rowCount).toBe(0)
  })
})

describe('bitácora', () => {
  it('registra la creación de copropiedades con quién la hizo', async () => {
    const r = await como(db, u.admin, `select usuario_id from bitacora where entidad = 'copropiedades' and accion = 'insert' and copropiedad_id = $1`, [copro.alamos])
    expect(r.rows[0].usuario_id).toBe(u.admin)
  })

  it('solo la ven los administradores de la organización', async () => {
    expect((await como(db, u.asistente, 'select * from bitacora')).rowCount).toBe(0)
    const ajena = await como(db, u.otraOrg, 'select * from bitacora where organizacion_id = $1', [org.a])
    expect(ajena.rowCount).toBe(0)
  })

  it('es inmutable incluso para el dueño de la base de datos', async () => {
    await expect(db.query(`update bitacora set accion = 'x'`)).rejects.toThrow(/no se puede modificar/)
    await expect(db.query('delete from bitacora')).rejects.toThrow(/no se puede modificar/)
    await expect(como(db, u.admin, `delete from bitacora`)).rejects.toThrow(/permission denied/)
  })
})

describe('personas, vínculos y autorizaciones', () => {
  const ids = { anaAlamos: '', personaSanta: '', personaAjena: '', unidadAlamos: '', unidadSanta: '', unidadAjena: '', politicaAlamos: '' }
  const reg = (quien: string, c: string, nombre: string, doc: string | null = null) =>
    como(db, quien, `select registrar_persona($1, $2, 'natural', $3, $4, $5) as id`, [c, nombre, doc ? 'CC' : null, doc, doc ? `${doc}@ejemplo.co` : null]).then(
      (r) => r.rows[0].id as string,
    )

  beforeAll(async () => {
    const unidad = (quien: string, c: string) =>
      como(db, quien, `insert into unidades (copropiedad_id, numero, coeficiente) values ($1, 'P1', 1) returning id`, [c]).then((r) => r.rows[0].id as string)
    ids.unidadAlamos = await unidad(u.admin, copro.alamos)
    ids.unidadSanta = await unidad(u.admin, copro.santaElena)
    ids.unidadAjena = await unidad(u.otraOrg, copro.ajena)
    ids.anaAlamos = await reg(u.asistente, copro.alamos, 'Ana Álamos', '1010')
    ids.personaSanta = await reg(u.admin, copro.santaElena, 'Persona Santa Elena', '2020')
    ids.personaAjena = await reg(u.otraOrg, copro.ajena, 'Persona Ajena', '3030')
    ids.politicaAlamos = (
      await como(db, u.admin, `insert into politicas_tratamiento (copropiedad_id, version, vigente_desde, meses_conservacion, texto) values ($1, '1', '2026-01-01', 24, $2) returning id`, [
        copro.alamos,
        'Texto de la política de tratamiento de datos personales de prueba.',
      ])
    ).rows[0].id
    await como(db, u.asistente, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo, reside) values ($1, $2, $3, 'residente', true)`, [copro.alamos, ids.unidadAlamos, ids.anaAlamos])
    await como(db, u.asistente, `insert into autorizaciones_datos (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades) values ($1, $2, $3, 'escrito', '2026-01-10', '{administracion}')`, [
      copro.alamos,
      ids.anaAlamos,
      ids.politicaAlamos,
    ])
  })

  it('otra organización no ve personas, datos, vínculos, políticas ni autorizaciones', async () => {
    for (const t of ['personas', 'personas_datos', 'vinculos_unidad', 'politicas_tratamiento', 'autorizaciones_datos']) {
      const r = await como(db, u.otraOrg, `select * from ${t} where copropiedad_id <> $1`, [copro.ajena])
      expect(r.rowCount, t).toBe(0)
    }
    expect((await como(db, u.otraOrg, 'select nombre from personas')).rows.map((x) => x.nombre)).toEqual(['Persona Ajena'])
  })

  it('la auxiliar ve solo las personas de su copropiedad', async () => {
    expect((await como(db, u.asistente, 'select nombre from personas')).rows.map((x) => x.nombre)).toEqual(['Ana Álamos'])
    expect((await como(db, u.asistente, 'select persona_id from personas_datos')).rows.map((x) => x.persona_id)).toEqual([ids.anaAlamos])
  })

  it('nadie registra personas en una copropiedad ajena', async () => {
    await expect(reg(u.otraOrg, copro.alamos, 'Intrusa')).rejects.toThrow(/permiso/)
    await expect(reg(u.asistente, copro.santaElena, 'Intrusa')).rejects.toThrow(/permiso/)
    await expect(como(db, u.otraOrg, `insert into personas (copropiedad_id, nombre) values ($1, 'Intrusa')`, [copro.alamos])).rejects.toThrow(/row-level security/)
  })

  it('un vínculo no mezcla unidad y persona de copropiedades distintas', async () => {
    // Persona de Santa Elena en una unidad de Álamos (misma organización).
    await expect(
      como(db, u.admin, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo) values ($1, $2, $3, 'residente')`, [copro.alamos, ids.unidadAlamos, ids.personaSanta]),
    ).rejects.toThrow(/foreign key/)
    // Persona ajena con la copropiedad de la unidad.
    await expect(
      como(db, u.otraOrg, `insert into vinculos_unidad (copropiedad_id, unidad_id, persona_id, tipo) values ($1, $2, $3, 'residente')`, [copro.ajena, ids.unidadAlamos, ids.personaAjena]),
    ).rejects.toThrow(/foreign key/)
  })

  it('los datos de contacto no se cuelgan de una persona de otra copropiedad', async () => {
    await expect(
      como(db, u.otraOrg, `insert into personas_datos (persona_id, copropiedad_id, correo) values ($1, $2, 'x@ejemplo.co')`, [ids.anaAlamos, copro.ajena]),
    ).rejects.toThrow(/foreign key|duplicate/)
  })

  it('una autorización no usa la política de otra copropiedad', async () => {
    await expect(
      como(db, u.admin, `insert into autorizaciones_datos (copropiedad_id, persona_id, politica_id, canal, otorgada_en, finalidades) values ($1, $2, $3, 'escrito', '2026-01-10', '{administracion}')`, [
        copro.santaElena,
        ids.personaSanta,
        ids.politicaAlamos,
      ]),
    ).rejects.toThrow(/foreign key/)
  })

  it('nadie edita ni revoca en una copropiedad ajena', async () => {
    expect((await como(db, u.otraOrg, `update personas set nombre = 'Cambiada' where id = $1`, [ids.anaAlamos])).rowCount).toBe(0)
    expect((await como(db, u.otraOrg, `update vinculos_unidad set hasta = current_date where persona_id = $1`, [ids.anaAlamos])).rowCount).toBe(0)
    expect((await como(db, u.otraOrg, `update autorizaciones_datos set revocada_en = current_date, revocacion_canal = 'correo' where persona_id = $1`, [ids.anaAlamos])).rowCount).toBe(0)
    expect((await como(db, u.asistente, `update personas set nombre = 'Cambiada' where id = $1`, [ids.personaSanta])).rowCount).toBe(0)
  })

  it('el listado de portería y el expediente no cruzan copropiedades', async () => {
    await expect(como(db, u.otraOrg, `select * from residentes_porteria($1)`, [copro.alamos])).rejects.toThrow(/permiso/)
    await expect(como(db, u.asistente, `select * from residentes_porteria($1)`, [copro.santaElena])).rejects.toThrow(/permiso/)
    await expect(como(db, u.otraOrg, `select * from historial_unidad($1)`, [ids.unidadAlamos])).rejects.toThrow(/permiso/)
    expect((await como(db, u.asistente, `select nombre from residentes_porteria($1)`, [copro.alamos])).rows).toEqual([{ nombre: 'Ana Álamos' }])
  })
})

describe('regla general', () => {
  it('toda tabla del esquema público tiene RLS activo', async () => {
    const r = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
    expect(r.rows.map((x) => x.relname)).toEqual([])
  })

  it('toda tabla con datos de copropiedad tiene al menos una política', async () => {
    const r = await db.query(`
      select distinct t.table_name from information_schema.columns t
      where t.table_schema = 'public' and t.column_name in ('copropiedad_id', 'organizacion_id')
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name)`)
    expect(r.rows).toEqual([])
  })
})
