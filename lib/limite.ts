// Límite de intentos (rate limiting) por IP y por usuario.
//
// Ventana fija: cada clave («ingreso:ip:1.2.3.4», «acciones:usuario:<id>»…) tiene un contador
// que se reinicia al terminar la ventana. Dos almacenes:
//   * Upstash Redis (REST), si están UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN:
//     el contador es compartido por todas las instancias del hosting. Es lo que se usa en producción.
//   * Memoria del proceso, si no: sirve en desarrollo y con una sola instancia. En un hosting
//     con varias instancias cada una cuenta por su lado (el límite real se multiplica).
// Si Redis no responde, se usa la memoria: la aplicación no se cae por el límite.

export type Regla = { max: number; ventanaSegundos: number }
export type Veredicto = { permitido: boolean; restantes: number; reintentarEnSegundos: number }

/** Límites de PH PRO. Generosos para el uso normal; cortan los ataques de fuerza bruta y el abuso. */
export const LIMITES = {
  /** Cualquier solicitud, por IP (páginas, recursos, acciones). */
  solicitudesIp: { max: 600, ventanaSegundos: 60 },
  /** Envíos de formularios y acciones del servidor (POST), por IP. */
  envioIp: { max: 60, ventanaSegundos: 60 },
  /** Envíos de formularios y acciones del servidor, por persona con sesión. */
  envioUsuario: { max: 60, ventanaSegundos: 60 },
  /** Intentos de ingreso o de recuperar contraseña, por IP. */
  ingresoIp: { max: 10, ventanaSegundos: 15 * 60 },
  /** Intentos de ingreso o de recuperar contraseña, por correo (desde cualquier IP). */
  ingresoCorreo: { max: 20, ventanaSegundos: 60 * 60 },
  /** Enlaces del correo (/auth/confirmar), por IP. */
  enlaceIp: { max: 20, ventanaSegundos: 15 * 60 },
  /** Invitaciones creadas, por persona. */
  invitacionUsuario: { max: 30, ventanaSegundos: 60 * 60 },
  /** Aceptar invitaciones (prueba de tokens), por persona. */
  aceptarInvitacionUsuario: { max: 10, ventanaSegundos: 15 * 60 },
  /** Importaciones de unidades aplicadas, por persona. */
  importacionUsuario: { max: 20, ventanaSegundos: 60 * 60 },
  /** Logos subidos, por persona. */
  logoUsuario: { max: 20, ventanaSegundos: 60 * 60 },
} satisfies Record<string, Regla>

// ---------------------------------------------------------------------------
// Memoria del proceso
// ---------------------------------------------------------------------------

const MAX_CLAVES = 50_000
const memoria = new Map<string, { cuenta: number; vence: number }>()

function contarEnMemoria(clave: string, ventanaMs: number, ahora: number) {
  let e = memoria.get(clave)
  if (!e || e.vence <= ahora) {
    if (memoria.size >= MAX_CLAVES) {
      for (const [k, v] of memoria) if (v.vence <= ahora) memoria.delete(k)
      // Si todas siguen vigentes, se descarta la más antigua (orden de inserción).
      if (memoria.size >= MAX_CLAVES) memoria.delete(memoria.keys().next().value as string)
    }
    e = { cuenta: 0, vence: ahora + ventanaMs }
    memoria.set(clave, e)
  }
  e.cuenta += 1
  return { cuenta: e.cuenta, venceEnMs: e.vence - ahora }
}

/** Solo para pruebas. */
export function reiniciarLimites() {
  memoria.clear()
}

// ---------------------------------------------------------------------------
// Upstash Redis (REST)
// ---------------------------------------------------------------------------

async function contarEnRedis(clave: string, ventanaSegundos: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/multi-exec`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', `phpro:limite:${clave}`],
        ['EXPIRE', `phpro:limite:${clave}`, String(ventanaSegundos), 'NX'],
        ['TTL', `phpro:limite:${clave}`],
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(800),
    })
    if (!r.ok) return null
    const [incr, , ttl] = (await r.json()) as { result: number }[]
    if (typeof incr?.result !== 'number') return null
    return { cuenta: incr.result, venceEnMs: Math.max(ttl?.result ?? ventanaSegundos, 1) * 1000 }
  } catch {
    return null
  }
}

/** Cuenta un intento para la clave y dice si todavía está dentro del límite. */
export async function consumir(clave: string, regla: Regla, ahora = Date.now()): Promise<Veredicto> {
  const conteo = (await contarEnRedis(clave, regla.ventanaSegundos)) ?? contarEnMemoria(clave, regla.ventanaSegundos * 1000, ahora)
  return {
    permitido: conteo.cuenta <= regla.max,
    restantes: Math.max(regla.max - conteo.cuenta, 0),
    reintentarEnSegundos: Math.ceil(conteo.venceEnMs / 1000),
  }
}

/** Texto para la persona cuando superó el límite. */
export function mensajeLimite(v: Veredicto) {
  const minutos = Math.max(1, Math.ceil(v.reintentarEnSegundos / 60))
  return `Demasiados intentos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e inténtalo de nuevo.`
}

// ---------------------------------------------------------------------------
// IP del cliente
// ---------------------------------------------------------------------------

/**
 * IP de quien hace la solicitud. Usa los encabezados que pone el hosting (Vercel los
 * reescribe, así que el navegador no los puede falsificar). Si la aplicación corre detrás
 * de otro proxy, ese proxy debe reemplazar X-Forwarded-For, no agregarle valores.
 */
export function ipCliente(h: Pick<Headers, 'get'>): string {
  const directa = h.get('x-vercel-forwarded-for') ?? h.get('x-real-ip')
  const reenviada = h.get('x-forwarded-for')?.split(',')[0]
  const ip = (directa ?? reenviada ?? '').trim()
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : 'desconocida'
}
