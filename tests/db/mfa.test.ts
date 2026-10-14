import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { activarFactor, como, comoAal1, crearBaseDePrueba, crearUsuario } from './helpers'

// Verificación en dos pasos exigida por la base de datos (auditoría, corrección ALTA 1).
// Una sesión aal1 (solo contraseña) no lee ni escribe nada si la persona tiene un factor
// verificado o un rol sensible; con aal2 todo sigue igual. Las demás personas no cambian.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
const u = {
  dueno: '',
  administradora: '',
  auxiliar: '',
  contador: '',
  revisor: '',
  consejo: '',
  consejoConFactor: '',
  porteriaFactorPendiente: '',
  nueva: '',
}
let org = ''
let copro = ''

const ROLES = [
  ['administradora', 'administradora'],
  ['auxiliar', 'auxiliar'],
  ['contador', 'contador'],
  ['revisor', 'revisor_fiscal'],
  ['consejo', 'consejo'],
  ['consejoConFactor', 'consejo'],
  ['porteriaFactorPendiente', 'porteria'],
] as const

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  for (const k of Object.keys(u) as (keyof typeof u)[]) u[k] = await crearUsuario(db, `${k}@ejemplo.co`)
  org = (await como(db, u.dueno, `select crear_organizacion('Administración de prueba') as id`)).rows[0].id
  copro = (await como(db, u.dueno, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Edificio Álamos 23', 'A23') returning id`, [org])).rows[0].id
  for (const [quien, rol] of ROLES) {
    await db.query(`insert into miembros_organizacion (organizacion_id, usuario_id) values ($1, $2)`, [org, u[quien]])
    await db.query(`insert into accesos_copropiedad (copropiedad_id, usuario_id, rol) values ($1, $2, $3)`, [copro, u[quien], rol])
  }
  await como(db, u.dueno, `insert into unidades (copropiedad_id, numero, coeficiente) values ($1, '101', 100)`, [copro])
  await db.query(`insert into storage.objects (bucket_id, name) values ('marcas', $1)`, [`${copro}/logo.png`])
  await activarFactor(db, u.consejoConFactor)
  await activarFactor(db, u.porteriaFactorPendiente, 'unverified')
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const SENSIBLES = ['dueno', 'administradora', 'auxiliar', 'contador', 'revisor'] as const
const verCopropiedades = (usuario: string, aal: 'aal1' | 'aal2') =>
  como(db, usuario, 'select nombre from copropiedades', [], aal).then((r) => r.rows.map((x) => x.nombre))

describe('roles sensibles: verificación obligatoria', () => {
  it('con aal1 no ven ninguna fila, ni de copropiedades, ni de unidades, ni de su perfil', async () => {
    for (const quien of SENSIBLES) {
      expect(await verCopropiedades(u[quien], 'aal1'), quien).toEqual([])
      expect((await comoAal1(db, u[quien], 'select * from unidades')).rowCount, quien).toBe(0)
      expect((await comoAal1(db, u[quien], 'select * from perfiles')).rowCount, quien).toBe(0)
      expect((await comoAal1(db, u[quien], 'select * from miembros_organizacion')).rowCount, quien).toBe(0)
    }
  })

  it('con aal1 no pueden escribir', async () => {
    await expect(comoAal1(db, u.dueno, `insert into unidades (copropiedad_id, numero, coeficiente) values ($1, '102', 1)`, [copro])).rejects.toThrow(/row-level security/)
    const r = await comoAal1(db, u.administradora, `update unidades set coeficiente = 50 where copropiedad_id = $1`, [copro])
    expect(r.rowCount).toBe(0)
    await expect(
      comoAal1(db, u.dueno, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Nueva', 'NV')`, [org]),
    ).rejects.toThrow(/row-level security/)
  })

  it('con aal1 tampoco pasan por las funciones de la base', async () => {
    await expect(comoAal1(db, u.administradora, `select guardar_identidad($1, 'Edificio Álamos 23 PH', '900123456-8', '3001234567')`, [copro])).rejects.toThrow(
      /verificación en dos pasos/,
    )
    await expect(comoAal1(db, u.dueno, `select crear_organizacion('Otra')`)).rejects.toThrow(/verificación en dos pasos/)
    await expect(comoAal1(db, u.contador, `select * from mis_permisos($1)`, [copro])).rejects.toThrow(/verificación en dos pasos/)
    await expect(
      comoAal1(db, u.administradora, `select aplicar_importacion_unidades($1, 'x.xlsx', '[{"numero":"1","coeficiente":1}]')`, [copro]),
    ).rejects.toThrow(/verificación en dos pasos/)
  })

  it('con aal1 no leen ni suben archivos', async () => {
    expect((await comoAal1(db, u.administradora, `select name from storage.objects`)).rowCount).toBe(0)
    await expect(comoAal1(db, u.dueno, `insert into storage.objects (bucket_id, name) values ('marcas', $1)`, [`${copro}/logo.jpg`])).rejects.toThrow(
      /row-level security/,
    )
  })

  it('con aal2 trabajan normalmente', async () => {
    for (const quien of SENSIBLES) expect(await verCopropiedades(u[quien], 'aal2'), quien).toEqual(['Edificio Álamos 23'])
    expect((await como(db, u.administradora, `select name from storage.objects`)).rows).toEqual([{ name: `${copro}/logo.png` }])
    expect((await como(db, u.contador, `select modulo from mis_permisos($1) order by modulo`, [copro])).rows.map((x) => x.modulo)).toEqual(['perfil', 'unidades'])
  })

  it('la aplicación sabe a quién llevar a activar la verificación', async () => {
    const pendiente = (usuario: string, aal: 'aal1' | 'aal2') => como(db, usuario, 'select mfa_pendiente() as p', [], aal).then((r) => r.rows[0].p)
    for (const quien of SENSIBLES) {
      expect(await pendiente(u[quien], 'aal1'), quien).toBe(true)
      expect(await pendiente(u[quien], 'aal2'), quien).toBe(false)
    }
    expect(await pendiente(u.consejo, 'aal1')).toBe(false)
    expect(await pendiente(u.nueva, 'aal1')).toBe(false)
  })
})

describe('quien activó un factor', () => {
  it('con aal1 queda bloqueado aunque su rol no lo exija', async () => {
    expect(await verCopropiedades(u.consejoConFactor, 'aal1')).toEqual([])
    expect((await comoAal1(db, u.consejoConFactor, 'select * from marcas_copropiedad')).rowCount).toBe(0)
  })

  it('con aal2 entra', async () => {
    expect(await verCopropiedades(u.consejoConFactor, 'aal2')).toEqual(['Edificio Álamos 23'])
  })

  it('un factor sin verificar no cuenta', async () => {
    expect(await verCopropiedades(u.porteriaFactorPendiente, 'aal1')).toEqual(['Edificio Álamos 23'])
  })
})

describe('personas sin factor y sin roles sensibles', () => {
  it('no se ven afectadas', async () => {
    expect(await verCopropiedades(u.consejo, 'aal1')).toEqual(['Edificio Álamos 23'])
    expect((await comoAal1(db, u.consejo, 'select modulo from mis_permisos($1) order by modulo', [copro])).rows.map((x) => x.modulo)).toEqual(['perfil', 'unidades'])
  })

  it('al crear su organización pasa a ser propietaria y desde ahí se le exige', async () => {
    const nueva = (await comoAal1(db, u.nueva, `select crear_organizacion('Mi administración') as id`)).rows[0].id
    expect((await comoAal1(db, u.nueva, 'select * from organizaciones')).rowCount).toBe(0)
    expect((await como(db, u.nueva, 'select id from organizaciones')).rows).toEqual([{ id: nueva }])
  })
})

describe('regla general', () => {
  it('toda tabla del esquema público tiene la política restrictiva exigir_mfa', async () => {
    const r = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'exigir_mfa'
            and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL' and 'authenticated' = any (p.roles)
        )`)
    expect(r.rows.map((x) => x.relname)).toEqual([])
  })

  it('storage.objects también la tiene', async () => {
    const r = await db.query(`select permissive, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'exigir_mfa'`)
    expect(r.rows).toEqual([{ permissive: 'RESTRICTIVE', cmd: 'ALL' }])
  })

  it('toda función security definer del esquema público exige el segundo paso', async () => {
    const r = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and p.proname not in ('mfa_pendiente')
        and p.prosrc not like '%app.exigir_mfa()%'`)
    expect(r.rows.map((x) => x.proname)).toEqual([])
  })
})
