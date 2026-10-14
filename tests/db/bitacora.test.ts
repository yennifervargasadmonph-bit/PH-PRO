import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { como, crearBaseDePrueba, crearUsuario } from './helpers'

// Bitácora sin datos personales (auditoría, corrección MEDIA 6): solo se registran con su
// valor los campos declarados en app.bitacora_campos; los demás quedan como '[dato personal]'
// y "cambios" dice qué campos cambiaron.

let base: Awaited<ReturnType<typeof crearBaseDePrueba>>
let db: pg.Client
let admin = ''
let org = ''
let copro = ''
const OCULTO = '[dato personal]'

beforeAll(async () => {
  base = await crearBaseDePrueba()
  db = base.db
  admin = await crearUsuario(db, 'admin@ejemplo.co')
  org = (await como(db, admin, `select crear_organizacion('Administración de prueba') as id`)).rows[0].id
  copro = (await como(db, admin, `insert into copropiedades (organizacion_id, nombre, prefijo) values ($1, 'Edificio Álamos 23', 'A23') returning id`, [org])).rows[0].id
}, 60_000)

afterAll(async () => {
  await base?.cerrar()
})

const ultima = async (entidad: string) =>
  (await db.query(`select accion, datos from bitacora where entidad = $1 order by id desc limit 1`, [entidad])).rows[0] as { accion: string; datos: Record<string, unknown> }

describe('datos personales en la bitácora', () => {
  it('los datos de contacto de la identidad se enmascaran y queda qué cambió', async () => {
    await como(
      db,
      admin,
      `update marcas_copropiedad set celular = '3001234567', correo = 'yennifer@ejemplo.co', representante_legal = 'Yennifer Vargas',
         telefono = '6011234567', color_primario = '#123456' where copropiedad_id = $1`,
      [copro],
    )
    const { datos } = await ultima('marcas_copropiedad')
    const despues = datos.despues as Record<string, unknown>
    expect(despues).toMatchObject({ celular: OCULTO, correo: OCULTO, representante_legal: OCULTO, telefono: OCULTO, color_primario: '#123456' })
    expect(datos.cambios).toEqual(expect.arrayContaining(['celular', 'correo', 'representante_legal', 'telefono', 'color_primario']))
    expect(JSON.stringify(datos)).not.toMatch(/3001234567|yennifer|Vargas|6011234567/)
  })

  it('un cambio solo de un dato personal queda registrado sin su valor', async () => {
    await como(db, admin, `update marcas_copropiedad set celular = '3109876543' where copropiedad_id = $1`, [copro])
    const { datos } = await ultima('marcas_copropiedad')
    expect(datos.cambios).toEqual(['actualizado_en', 'celular'])
    expect((datos.antes as Record<string, unknown>).celular).toBe(OCULTO)
    expect(JSON.stringify(datos)).not.toMatch(/3109876543|3001234567/)
  })

  it('las invitaciones se registran sin el correo ni el hash del token', async () => {
    await como(db, admin, `select invitar_persona($1, 'persona.invitada@ejemplo.co', 'miembro', $2, 'contador')`, [org, copro])
    const { accion, datos } = await ultima('invitaciones')
    expect(accion).toBe('insert')
    expect(datos).toMatchObject({ correo: OCULTO, token_hash: OCULTO, rol: 'miembro', rol_copropiedad: 'contador', estado: 'pendiente' })
    expect(JSON.stringify(datos)).not.toMatch(/persona\.invitada/)
  })

  it('los rechazos de una importación (filas del archivo) se enmascaran', async () => {
    await como(db, admin, `select aplicar_importacion_unidades($1, 'u.xlsx', $2, $3)`, [
      copro,
      JSON.stringify([{ numero: '101', coeficiente: 100 }]),
      JSON.stringify([{ fila: 3, error: 'Coeficiente vacío', datos: { propietario: 'Ana Pérez', cedula: '1020304050' } }]),
    ])
    const { datos } = await ultima('importaciones')
    expect(datos).toMatchObject({ rechazos: OCULTO, archivo: 'u.xlsx', rechazadas: 1 })
    expect(JSON.stringify(datos)).not.toMatch(/Ana Pérez|1020304050/)
    const unidad = await ultima('unidades')
    expect(unidad.datos).toMatchObject({ numero: '101', coeficiente: 100 })
  })

  it('una tabla o columna nueva sin declarar se enmascara por completo', async () => {
    await db.query(`create table public.prueba_residentes (id uuid primary key default gen_random_uuid(), copropiedad_id uuid, nombres text, documento text)`)
    await db.query(`create trigger bitacora_prueba after insert on public.prueba_residentes for each row execute function app.registrar_bitacora()`)
    await db.query(`insert into public.prueba_residentes (copropiedad_id, nombres, documento) values ($1, 'Carlos Ruiz', '79123456')`, [copro])
    const r = await db.query(`select copropiedad_id, datos from bitacora where entidad = 'prueba_residentes'`)
    expect(r.rows[0].copropiedad_id).toBe(copro)
    expect(r.rows[0].datos).toMatchObject({ nombres: OCULTO, documento: OCULTO })
    await db.query('drop table public.prueba_residentes')
  })

  it('la lista de campos no la ve ni la cambia nadie desde la aplicación', async () => {
    await expect(como(db, admin, 'select * from app.bitacora_campos')).rejects.toThrow(/permission denied/)
    await expect(como(db, admin, `insert into app.bitacora_campos values ('marcas_copropiedad', 'celular')`)).rejects.toThrow(/permission denied/)
  })

  it('todas las tablas con bitácora tienen campos declarados', async () => {
    const r = await db.query(`
      select distinct c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      where p.proname = 'registrar_bitacora' and not t.tgisinternal
        and not exists (select 1 from app.bitacora_campos b where b.tabla = c.relname)`)
    expect(r.rows).toEqual([])
  })
})
