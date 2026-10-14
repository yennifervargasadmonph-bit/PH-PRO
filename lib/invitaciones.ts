// Invitaciones al equipo: reglas puras que comparten la acción del servidor y las pruebas.

/** Mensaje único al invitar: nunca revela si el correo tiene cuenta. */
export const MENSAJE_INVITACION = 'Si el correo corresponde a una cuenta o se registra, recibirá la invitación.'

/** Enlace que la administración comparte con la persona invitada. */
export function enlaceInvitacion(sitio: string, token: string) {
  const u = new URL('/invitacion', sitio)
  u.searchParams.set('token', token)
  return u.toString()
}

/** El token tiene 64 caracteres hexadecimales; cualquier otra cosa se descarta sin consultar la base. */
export const tokenValido = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)
