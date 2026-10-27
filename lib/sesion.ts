/** Cierre de sesión por inactividad (30 minutos, según la estrategia de seguridad). */
export const MINUTOS_INACTIVIDAD = 30
export const COOKIE_ACTIVIDAD = 'phpro_ultima_actividad'
export const COOKIE_COPROPIEDAD = 'phpro_copropiedad_activa'

/** Rutas que se pueden ver sin sesión iniciada. */
export const RUTAS_PUBLICAS = ['/ingresar', '/recuperar', '/auth/confirmar']

/** Rutas con sesión a las que se puede llegar sin haber hecho el segundo paso. */
export const RUTAS_SIN_MFA = ['/verificar', '/salir']

export function esRutaPublica(ruta: string) {
  return RUTAS_PUBLICAS.some((r) => ruta === r || ruta.startsWith(`${r}/`))
}

/**
 * Verdadero si pasó más tiempo que el permitido desde la última actividad registrada.
 * Sin registro de actividad la sesión se da por vencida: la cookie se fija al ingresar
 * (contraseña o enlace del correo) y el proxy la renueva en cada solicitud.
 */
export function sesionVencida(ultimaActividad: string | undefined, ahora = Date.now()) {
  if (!ultimaActividad) return true
  const t = Number(ultimaActividad)
  if (!Number.isFinite(t)) return true
  return ahora - t > MINUTOS_INACTIVIDAD * 60_000
}

/**
 * Solo permite volver a rutas internas después de iniciar sesión. Se rechazan los caracteres
 * de control y la barra invertida en cualquier posición: el navegador descarta tabuladores y
 * saltos de línea, así que «/\t/sitio.com» terminaría siendo «//sitio.com» (otro dominio).
 */
export function destinoSeguro(destino: string | null | undefined) {
  if (!destino || destino.length > 2048 || !destino.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(destino)) return '/central'
  try {
    const base = 'https://ph-pro.invalid'
    const u = new URL(destino, base)
    if (u.origin !== base) return '/central'
    return u.pathname + u.search + u.hash
  } catch {
    return '/central'
  }
}

/**
 * Duración máxima de una sesión, aunque haya actividad: al terminar la jornada se vuelve a
 * ingresar con contraseña y código. Debe coincidir con «Time-box user sessions» en Supabase.
 */
export const HORAS_SESION_MAXIMA = 12

/**
 * Verdadero si la sesión empezó hace más de HORAS_SESION_MAXIMA. El inicio sale del claim
 * «amr» del token de Supabase (momento en que se puso la contraseña, el código o el enlace).
 * Sin «amr» legible la sesión no se corta aquí (lo hace Supabase con su propia configuración).
 */
export function sesionExcedeMaximo(amr: unknown, ahora = Date.now()) {
  if (!Array.isArray(amr)) return false
  const marcas = amr.map((m) => Number((m as { timestamp?: unknown })?.timestamp)).filter((t) => Number.isFinite(t) && t > 0)
  if (!marcas.length) return false
  return ahora - Math.min(...marcas) * 1000 > HORAS_SESION_MAXIMA * 3_600_000
}

/** Cookie que registra la última actividad (se fija al ingresar y se renueva en cada solicitud). */
export function cookieActividad(segura: boolean, ahora = Date.now()) {
  return {
    name: COOKIE_ACTIVIDAD,
    value: String(ahora),
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: segura,
    path: '/',
    maxAge: MINUTOS_INACTIVIDAD * 60 * 4,
  }
}
