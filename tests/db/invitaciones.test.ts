import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { como, crearBaseDePrueba, crearUsuario } from './helpers'

// Equipo por invitación (auditoría, corrección ALTA 2): el correo del perfil no se puede
// cambiar, invitar no revela si un correo tiene cuenta y solo acepta quien inició sesión
// con el correo invitado.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
const u = { admin: '', otraAdmin: '', victima: '', atacante: '', auxiliar: '', sinConfirmar: '' }
let org = ''
let orgB = ''
let copro = ''
let coproB = ''

const NEUTRO = /^[0-9a-f]{64}$/

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  for (const k of Object.keys(u) as (keyof typeof u)[]) u[k] = await crearUsuario(db, `${k}@ejemplo.co`)
  await db.query('update auth.users set email_confirmed_at = null where id = $1', [u.sinConfirmar])
  org = (await como(db, u.admin, `select crear_organizacion('Administración de prueba') as id`)).rows[0].id
  orgB = (await como(db, u.otraAdmin, `select crear_organizacion('Otra') as id`)).rows[0].id
  copro = (await como(db, u.admin, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Edificio Álamos 23', 'A23') returning id`, [org])).rows[0].id
  coproB = (await como(db, u.otraAdmin, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Ajena', 'AJ') returning id`, [orgB])).rows[0].id
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const invitar = (quien: string, o: string, correo: string, rol = 'miembro', c: string | null = null, rolC: string | null = null) =>
  como(db, quien, 'select invitar_persona($1, $2, $3, $4, $5) as t', [o, correo, rol, c, rolC]).then((r) => r.rows[0].t as string)
const aceptar = (quien: string, token: string) => como(db, quien, 'select aceptar_invitacion($1) as org', [token]).then((r) => r.rows[0].org as string)
const esMiembro = async (quien: string, o: string) =>
  (await db.query('select 1 from miembros_organizacion where usuario_id = $1 and organizacion_id = $2', [quien, o])).rowCount === 1

describe('el correo del perfil no se puede suplantar', () => {
  it('nadie cambia su correo para hacerse pasar por otra persona', async () => {
    await expect(como(db, u.atacante, `update perfiles set correo = 'victima@ejemplo.co' where id = $1`, [u.atacante])).rejects.toThrow(/permission denied/)
    expect((await db.query('select correo from perfiles where id = $1', [u.atacante])).rows[0].correo).toBe('atacante@ejemplo.co')
  })

  it('la invitación a la víctima no la puede aceptar el atacante', async () => {
    const token = await invitar(u.admin, org, 'victima@ejemplo.co')
    await expect(aceptar(u.atacante, token)).rejects.toThrow(/no es válida/)
    expect(await esMiembro(u.atacante, org)).toBe(false)
    expect(await aceptar(u.victima, token)).toBe(org)
    expect(await esMiembro(u.victima, org)).toBe(true)
  })
})

describe('invitar no revela si el correo tiene cuenta', () => {
  it('la respuesta es igual para un correo con cuenta y uno sin cuenta', async () => {
    const conCuenta = await invitar(u.admin, org, 'auxiliar@ejemplo.co')
    const sinCuenta = await invitar(u.admin, org, 'nadie-todavia@ejemplo.co')
    expect(conCuenta).toMatch(NEUTRO)
    expect(sinCuenta).toMatch(NEUTRO)
    expect(conCuenta).not.toBe(sinCuenta)
  })

  it('la función no consulta auth.users ni perfiles al invitar', async () => {
    const r = await db.query(`select prosrc from pg_proc where proname = 'invitar_persona'`)
    expect(r.rows[0].prosrc).not.toMatch(/auth\.users|perfiles/)
  })

  it('quien se registre después con ese correo puede aceptar', async () => {
    const token = await invitar(u.admin, org, 'Recien.Llegada@Ejemplo.co')
    const nueva = await crearUsuario(db, 'recien.llegada@ejemplo.co')
    expect(await aceptar(nueva, token)).toBe(org)
  })
})

describe('aceptar', () => {
  it('el correo se compara sin distinguir mayúsculas', async () => {
    const otro = await crearUsuario(db, 'Mayusculas@Ejemplo.CO')
    const token = await invitar(u.admin, org, 'mayusculas@ejemplo.co')
    expect(await aceptar(otro, token)).toBe(org)
  })

  it('da el acceso a la copropiedad con el rol indicado', async () => {
    const token = await invitar(u.admin, org, 'auxiliar@ejemplo.co', 'miembro', copro, 'auxiliar')
    await aceptar(u.auxiliar, token)
    const r = await como(db, u.auxiliar, 'select rol from accesos_copropiedad where copropiedad_id = $1', [copro])
    expect(r.rows).toEqual([{ rol: 'auxiliar' }])
  })

  it('una invitación se usa una sola vez', async () => {
    const token = await invitar(u.admin, org, 'victima@ejemplo.co', 'miembro', copro, 'consejo')
    await aceptar(u.victima, token)
    await expect(aceptar(u.victima, token)).rejects.toThrow(/no es válida/)
  })

  it('no sirve una invitación vencida, revocada, reemplazada ni un token inventado', async () => {
    const vencida = await invitar(u.admin, org, 'atacante@ejemplo.co')
    await db.query(`update invitaciones set expira_en = now() - interval '1 minute' where correo = 'atacante@ejemplo.co' and estado = 'pendiente'`)
    await expect(aceptar(u.atacante, vencida)).rejects.toThrow(/no es válida/)

    const revocada = await invitar(u.admin, org, 'atacante@ejemplo.co')
    const id = (await como(db, u.admin, `select id from invitaciones where correo = 'atacante@ejemplo.co' and estado = 'pendiente'`)).rows[0].id
    await como(db, u.admin, 'select revocar_invitacion($1)', [id])
    await expect(aceptar(u.atacante, revocada)).rejects.toThrow(/no es válida/)

    const primera = await invitar(u.admin, org, 'atacante@ejemplo.co')
    await invitar(u.admin, org, 'atacante@ejemplo.co')
    await expect(aceptar(u.atacante, primera)).rejects.toThrow(/no es válida/)

    await expect(aceptar(u.atacante, 'f'.repeat(64))).rejects.toThrow(/no es válida/)
    expect(await esMiembro(u.atacante, org)).toBe(false)
  })

  it('una cuenta con el correo sin confirmar no puede aceptar', async () => {
    const token = await invitar(u.admin, org, 'sinconfirmar@ejemplo.co')
    await expect(aceptar(u.sinConfirmar, token)).rejects.toThrow(/no es válida/)
  })

  it('la persona invitada ve a qué la invitan; nadie más', async () => {
    const token = await invitar(u.admin, org, 'sinconfirmar@ejemplo.co', 'miembro', copro, 'contador')
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [u.sinConfirmar])
    const suya = await como(db, u.sinConfirmar, 'select organizacion, rol, copropiedad, rol_copropiedad from consultar_invitacion($1)', [token])
    expect(suya.rows).toEqual([{ organizacion: 'Administración de prueba', rol: 'miembro', copropiedad: 'Edificio Álamos 23', rol_copropiedad: 'contador' }])
    expect((await como(db, u.atacante, 'select * from consultar_invitacion($1)', [token])).rowCount).toBe(0)
  })
})

describe('quién invita y quién ve las invitaciones', () => {
  it('solo la administración de la organización invita', async () => {
    await expect(invitar(u.auxiliar, org, 'x@ejemplo.co')).rejects.toThrow(/Solo la administración/)
    await expect(invitar(u.otraAdmin, org, 'x@ejemplo.co')).rejects.toThrow(/Solo la administración/)
    await expect(como(db, null, `select invitar_persona($1, 'x@ejemplo.co')`, [org])).rejects.toThrow(/permission denied/)
  })

  it('no se invita a propietarios ni a copropiedades de otra organización', async () => {
    await expect(invitar(u.admin, org, 'x@ejemplo.co', 'propietario')).rejects.toThrow(/propietario/)
    await expect(invitar(u.admin, org, 'x@ejemplo.co', 'miembro', coproB, 'administradora')).rejects.toThrow(/no pertenece/)
    await expect(invitar(u.admin, org, 'no-es-correo')).rejects.toThrow(/correo válido/)
  })

  it('las invitaciones no se crean ni se cambian directamente', async () => {
    await expect(
      como(db, u.admin, `insert into invitaciones (organizacion_id, correo, token_hash, expira_en, invitado_por) values ($1, 'a@b.co', $2, now(), $3)`, [org, 'a'.repeat(64), u.admin]),
    ).rejects.toThrow(/permission denied/)
    await expect(como(db, u.admin, `update invitaciones set estado = 'pendiente'`)).rejects.toThrow(/permission denied/)
  })

  it('la administración ve sus invitaciones, sin el hash del token; las demás personas no', async () => {
    expect((await como(db, u.admin, 'select count(id)::int as n from invitaciones')).rows[0].n).toBeGreaterThan(0)
    await expect(como(db, u.admin, 'select token_hash from invitaciones')).rejects.toThrow(/permission denied/)
    expect((await como(db, u.otraAdmin, 'select id from invitaciones where organizacion_id = $1', [org])).rowCount).toBe(0)
    expect((await como(db, u.auxiliar, 'select id from invitaciones')).rowCount).toBe(0)
  })

  it('solo la administración de la organización revoca', async () => {
    await invitar(u.admin, org, 'por-revocar@ejemplo.co')
    const id = (await como(db, u.admin, `select id from invitaciones where correo = 'por-revocar@ejemplo.co' and estado = 'pendiente'`)).rows[0].id
    await expect(como(db, u.otraAdmin, 'select revocar_invitacion($1)', [id])).rejects.toThrow(/No hay una invitación/)
    await expect(como(db, u.auxiliar, 'select revocar_invitacion($1)', [id])).rejects.toThrow(/No hay una invitación/)
  })

  it('el token solo se guarda como hash', async () => {
    const token = await invitar(u.admin, org, 'hash@ejemplo.co')
    const r = await db.query(`select token_hash from invitaciones where correo = 'hash@ejemplo.co'`)
    expect(r.rows[0].token_hash).not.toBe(token)
    expect(r.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect((await db.query(`select count(*)::int as n from invitaciones where token_hash = $1`, [token])).rows[0].n).toBe(0)
  })
})
