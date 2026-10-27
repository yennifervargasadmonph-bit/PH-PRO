/**
 * URL pública de la aplicación, para los enlaces que salen de ella (invitaciones,
 * recuperación de contraseña). Se toma solo de NEXT_PUBLIC_SITE_URL: armarla con el
 * encabezado Host permitiría que una solicitud manipulada genere enlaces a otro dominio.
 * En desarrollo, sin la variable, usa http://localhost:3000. En producción, sin la
 * variable, devuelve null y la acción informa que falta configurarla.
 */
export function urlSitio(entorno: Partial<Record<'NEXT_PUBLIC_SITE_URL' | 'NODE_ENV', string>> = process.env): string | null {
  const valor = entorno.NEXT_PUBLIC_SITE_URL?.trim()
  if (valor) {
    try {
      const u = new URL(valor)
      if (u.protocol === 'https:' || (u.protocol === 'http:' && entorno.NODE_ENV !== 'production')) return u.origin
    } catch {
      // Valor mal escrito: se trata como si faltara.
    }
    return null
  }
  return entorno.NODE_ENV === 'production' ? null : 'http://localhost:3000'
}

export const FALTA_URL_SITIO = 'Falta configurar la dirección pública de la aplicación (NEXT_PUBLIC_SITE_URL). Avisa a quien administra PH PRO.'
