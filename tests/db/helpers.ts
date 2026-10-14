import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres'

/** Crea una base de datos nueva, aplica el shim de Supabase y todas las migraciones. */
export async function crearBaseDePrueba() {
  const nombre = `phpro_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`create database ${nombre}`)
  await admin.end()

  const url = new URL(ADMIN_URL)
  url.pathname = `/${nombre}`
  const db = new pg.Client({ connectionString: url.toString() })
  await db.connect()
  await db.query(readFileSync(join(__dirname, 'supabase-shim.sql'), 'utf8'))
  const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
  for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(dir, archivo), 'utf8'))
  }

  return {
    db,
    async cerrar() {
      await db.end()
      const a = new pg.Client({ connectionString: ADMIN_URL })
      await a.connect()
      await a.query(`drop database if exists ${nombre} with (force)`)
      await a.end()
    },
  }
}

/** Crea un usuario en auth.users (como lo haría el proveedor de autenticación). */
export async function crearUsuario(db: pg.Client, correo: string) {
  const id = randomUUID()
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id,
    correo,
    { nombre: correo.split('@')[0] },
  ])
  return id
}

/** Nivel de verificación de la sesión: aal1 (solo contraseña) o aal2 (con segundo paso). */
export type Aal = 'aal1' | 'aal2'

/**
 * Ejecuta una consulta como lo haría PostgREST para un usuario con sesión:
 * rol `authenticated` y el id del usuario en los claims del JWT.
 * Con `usuario = null` se ejecuta como visitante anónimo.
 * Por defecto la sesión ya pasó la verificación en dos pasos (aal2); las pruebas de
 * MFA usan `comoAal1` para simular una sesión que solo puso la contraseña.
 */
export async function como<T extends pg.QueryResultRow = pg.QueryResultRow>(
  db: pg.Client,
  usuario: string | null,
  sql: string,
  params: unknown[] = [],
  aal: Aal = 'aal2',
) {
  await db.query('begin')
  try {
    if (usuario) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: usuario, role: 'authenticated', aal }),
      ])
      await db.query('set local role authenticated')
    } else {
      await db.query('set local role anon')
    }
    const r = await db.query<T>(sql, params)
    await db.query('commit')
    return r
  } catch (e) {
    await db.query('rollback')
    throw e
  }
}

/** Igual que `como`, pero con una sesión que no ha hecho el segundo paso (aal1). */
export function comoAal1<T extends pg.QueryResultRow = pg.QueryResultRow>(db: pg.Client, usuario: string, sql: string, params: unknown[] = []) {
  return como<T>(db, usuario, sql, params, 'aal1')
}

/** Registra un factor de verificación en dos pasos para el usuario. */
export async function activarFactor(db: pg.Client, usuario: string, estado: 'verified' | 'unverified' = 'verified') {
  await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, $2)`, [usuario, estado])
}
