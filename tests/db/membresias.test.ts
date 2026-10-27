import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { como, crearBaseDePrueba, crearUsuario, unirAOrganizacion } from './helpers'

// Auditoría del 27/10/2026: nadie entra a una organización ni recibe acceso a una
// copropiedad sin aceptar una invitación. Un UPDATE que cambia de persona o de
// organización una membresía (o un acceso) equivaldría a agregar a alguien sin su permiso.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
const u = { propietaria: '', admin: '', miembro: '', victima: '', otraAdmin: '' }
let org = ''
let orgB = ''
let copro = ''
let coproB = ''

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  for (const k of Object.keys(u) as (keyof typeof u)[]) u[k] = await crearUsuario(db, `${k}@ejemplo.co`)
  org = (await como(db, u.propietaria, `select crear_organizacion('Administración de prueba') as id`)).rows[0].id
  orgB = (await como(db, u.otraAdmin, `select crear_organizacion('Otra') as id`)).rows[0].id
  copro = (await como(db, u.propietaria, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Edificio Álamos 23', 'A23') returning id`, [org])).rows[0].id
  coproB = (await como(db, u.otraAdmin, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Ajena', 'AJ') returning id`, [orgB])).rows[0].id
  await unirAOrganizacion(db, u.propietaria, org, u.admin, { rol: 'administrador' })
  await unirAOrganizacion(db, u.propietaria, org, u.miembro, { copropiedad: copro, rolCopropiedad: 'consejo' })
  await unirAOrganizacion(db, u.otraAdmin, orgB, u.admin, { rol: 'administrador' })
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const esMiembro = async (quien: string, o: string) =>
  (await db.query('select 1 from miembros_organizacion where usuario_id = $1 and organizacion_id = $2', [quien, o])).rowCount === 1

describe('una membresía no cambia de persona ni de organización', () => {
  it('la administración no convierte la membresía de otro en la de alguien no invitado', async () => {
    await expect(
      como(db, u.admin, 'update miembros_organizacion set usuario_id = $1 where organizacion_id = $2 and usuario_id = $3', [u.victima, org, u.miembro]),
    ).rejects.toThrow(/no puede cambiar/)
    expect(await esMiembro(u.victima, org)).toBe(false)
    expect(await esMiembro(u.miembro, org)).toBe(true)
  })

  it('tampoco la pasa a otra organización que también administra', async () => {
    await expect(
      como(db, u.admin, 'update miembros_organizacion set organizacion_id = $1 where organizacion_id = $2 and usuario_id = $3', [orgB, org, u.miembro]),
    ).rejects.toThrow(/no puede cambiar/)
    expect(await esMiembro(u.miembro, orgB)).toBe(false)
  })

  it('sí puede cambiar el rol', async () => {
    await como(db, u.admin, `update miembros_organizacion set rol = 'administrador' where organizacion_id = $1 and usuario_id = $2`, [org, u.miembro])
    await como(db, u.admin, `update miembros_organizacion set rol = 'miembro' where organizacion_id = $1 and usuario_id = $2`, [org, u.miembro])
  })
})

describe('un acceso a copropiedad no cambia de persona ni de copropiedad', () => {
  it('no se le da acceso a alguien que no es del equipo', async () => {
    await expect(
      como(db, u.admin, 'update accesos_copropiedad set usuario_id = $1 where copropiedad_id = $2 and usuario_id = $3', [u.victima, copro, u.miembro]),
    ).rejects.toThrow(/no puede cambiar/)
  })

  it('no se mueve a una copropiedad de otra organización', async () => {
    await expect(
      como(db, u.admin, 'update accesos_copropiedad set copropiedad_id = $1 where copropiedad_id = $2 and usuario_id = $3', [coproB, copro, u.miembro]),
    ).rejects.toThrow(/no puede cambiar/)
  })

  it('sí puede cambiar el rol en la copropiedad', async () => {
    await como(db, u.admin, `update accesos_copropiedad set rol = 'contador' where copropiedad_id = $1 and usuario_id = $2`, [copro, u.miembro])
  })
})

describe('asignar acceso desde la pantalla Equipo sigue funcionando', () => {
  it('el upsert por (copropiedad, persona) cambia el rol', async () => {
    await como(
      db,
      u.admin,
      `insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, 'auxiliar')
       on conflict (copropiedad_id, usuario_id) do update set copropiedad_id = excluded.copropiedad_id, usuario_id = excluded.usuario_id, rol = excluded.rol`,
      [copro, u.miembro],
    )
    expect((await db.query('select rol from accesos_copropiedad where copropiedad_id = $1 and usuario_id = $2', [copro, u.miembro])).rows[0].rol).toBe('auxiliar')
  })
})
