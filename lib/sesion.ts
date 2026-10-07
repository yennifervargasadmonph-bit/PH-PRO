/** Cierre de sesión por inactividad (30 minutos, según la estrategia de seguridad). */
export const MINUTOS_INACTIVIDAD = 30
export const COOKIE_ACTIVIDAD = 'phpro_ultima_actividad'
export const COOKIE_COPROPIEDAD = 'phpro_copropiedad_activa'

/** Rutas que se pueden ver sin sesión iniciada. */
export const RUTAS_PUBLICAS = ['/ingresar', '/recuperar', '/auth/confirmar']

export function esRutaPublica(ruta: string) {
  return RUTAS_PUBLICAS.some((r) => ruta === r || ruta.startsWith(`${r}/`))
}

/** Verdadero si pasó más tiempo que el permitido desde la última actividad registrada. */
export function sesionVencida(ultimaActividad: string | undefined, ahora = Date.now()) {
  if (!ultimaActividad) return false
  const t = Number(ultimaActividad)
  if (!Number.isFinite(t)) return true
  return ahora - t > MINUTOS_INACTIVIDAD * 60_000
}

/** Solo permite volver a rutas internas después de iniciar sesión. */
export function destinoSeguro(destino: string | null | undefined) {
  if (!destino || !destino.startsWith('/') || destino.startsWith('//') || destino.startsWith('/\\')) return '/central'
  return destino
}
