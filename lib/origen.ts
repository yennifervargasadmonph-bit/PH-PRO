// CORS y origen de las solicitudes.
//
// PH PRO no ofrece una API para otros sitios: el navegador de la persona solo habla con la
// propia aplicación y con Supabase (Supabase maneja su propio CORS). Por eso la política es
// cerrada: la aplicación nunca envía Access-Control-Allow-Origin, las preguntas previas
// (OPTIONS) de otros orígenes se rechazan y ningún envío (POST, PUT, PATCH, DELETE) que venga
// de otro sitio llega a las páginas ni a las acciones del servidor. Así otro sitio no puede
// leer respuestas ni hacer cambios con la sesión de la persona (CSRF).
//
// Si algún día otro dominio propio necesita llamar a la aplicación (por ejemplo la sub-app de
// votación), se agrega en ORIGENES_PERMITIDOS (separados por comas, con https://).

const METODOS_SEGUROS = new Set(['GET', 'HEAD'])

export type SolicitudOrigen = {
  metodo: string
  /** Encabezado Origin (lo pone el navegador; null si no viene). */
  origin: string | null
  /** Encabezado Sec-Fetch-Site (same-origin, same-site, cross-site, none). */
  secFetchSite: string | null
  /** Origen propio de la aplicación (https://dominio). */
  propio: string
  /** NEXT_PUBLIC_SITE_URL y ORIGENES_PERMITIDOS. */
  permitidos?: string[]
}

export type DecisionOrigen = { permitir: true } | { permitir: false; estado: 403; motivo: string }

/** Lista de orígenes válidos a partir de las variables de entorno (ignora valores mal escritos). */
export function origenesPermitidos(...valores: (string | undefined)[]): string[] {
  const salida: string[] = []
  for (const v of valores.flatMap((x) => (x ?? '').split(','))) {
    try {
      const u = new URL(v.trim())
      if (u.protocol === 'https:' || u.protocol === 'http:') salida.push(u.origin)
    } catch {
      // vacío o mal escrito
    }
  }
  return salida
}

export function evaluarOrigen(s: SolicitudOrigen): DecisionOrigen {
  const metodo = s.metodo.toUpperCase()
  const validos = new Set([s.propio, ...(s.permitidos ?? [])])

  if (metodo === 'OPTIONS') {
    // Pregunta previa de CORS: nunca se autoriza a otro origen.
    if (s.origin && validos.has(s.origin)) return { permitir: true }
    return { permitir: false, estado: 403, motivo: 'CORS: origen no permitido' }
  }
  if (METODOS_SEGUROS.has(metodo)) return { permitir: true }

  // Envíos: deben venir de la propia aplicación.
  if (s.origin) {
    if (s.origin !== 'null' && validos.has(s.origin)) return { permitir: true }
    return { permitir: false, estado: 403, motivo: 'Envío desde otro sitio' }
  }
  // Sin Origin (navegadores antiguos o clientes que no son navegador): se usa Sec-Fetch-Site si viene.
  if (s.secFetchSite === 'cross-site' || s.secFetchSite === 'same-site') {
    return { permitir: false, estado: 403, motivo: 'Envío desde otro sitio' }
  }
  return { permitir: true }
}
