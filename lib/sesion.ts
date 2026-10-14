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

/** Solo permite volver a rutas internas después de iniciar sesión. */
export function destinoSeguro(destino: string | null | undefined) {
  if (!destino || !destino.startsWith('/') || destino.startsWith('//') || destino.startsWith('/\\')) return '/central'
  return destino
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
