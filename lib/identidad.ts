// Identidad de la copropiedad: reglas puras que comparten el servidor, el navegador
// y los documentos (sprint 4). La lectura desde la base está en lib/identidad-servidor.ts.

export const DATO_FALTANTE = 'Dato faltante'

const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

/** Dígito de verificación de un NIT colombiano (DIAN, módulo 11). */
export function calcularDv(numero: string): number {
  const digitos = numero.replace(/\D/g, '')
  if (!digitos || digitos.length > PESOS_NIT.length) throw new Error('NIT inválido')
  let suma = 0
  for (let i = 0; i < digitos.length; i++) {
    suma += Number(digitos[digitos.length - 1 - i]) * PESOS_NIT[i]
  }
  const residuo = suma % 11
  return residuo < 2 ? residuo : 11 - residuo
}

export type ResultadoNit = { ok: true; nit: string } | { ok: false; error: string }

/**
 * Valida un NIT escrito por una persona ("900.123.456-8", "900123456 8", "900123456").
 * Si trae dígito de verificación lo comprueba; si no, lo calcula. Devuelve "900123456-8".
 */
export function validarNit(entrada: string): ResultadoNit {
  const limpio = entrada.trim().replace(/[.\s]/g, '')
  const m = limpio.match(/^(\d{6,12})(?:-?(\d))?$/)
  if (!m) return { ok: false, error: 'Escribe el NIT con 6 a 12 dígitos y su dígito de verificación, por ejemplo 900123456-8.' }
  const [, numero, dv] = m
  const calculado = calcularDv(numero)
  if (dv !== undefined && Number(dv) !== calculado) return { ok: false, error: 'El dígito de verificación no corresponde a este NIT.' }
  return { ok: true, nit: `${numero}-${calculado}` }
}

/** "900123456-8" -> "900.123.456-8". */
export function formatearNit(nit: string): string {
  const [numero, dv] = nit.split('-')
  const conPuntos = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return dv === undefined ? conPuntos : `${conPuntos}-${dv}`
}

/**
 * Celular colombiano: 10 dígitos que empiezan por 3. Acepta espacios, guiones,
 * paréntesis, puntos y el indicativo +57. Devuelve "3001234567" o null.
 */
export function normalizarCelular(entrada: string): string | null {
  let d = entrada.trim().replace(/[\s().-]/g, '')
  if (d.startsWith('+57')) d = d.slice(3)
  else if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
  return /^3\d{9}$/.test(d) ? d : null
}

/** "3001234567" -> "300 123 4567". */
export function formatearCelular(celular: string): string {
  const d = normalizarCelular(celular) ?? celular
  return /^\d{10}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d
}

export const LARGO_NOMBRE_LEGAL = { min: 5, max: 160 } as const

/** Nombre completo con espacios normalizados, o el mensaje de error. */
export function validarNombreLegal(entrada: string): { ok: true; nombre: string } | { ok: false; error: string } {
  const nombre = entrada.trim().replace(/\s+/g, ' ')
  if (nombre.length < LARGO_NOMBRE_LEGAL.min) return { ok: false, error: 'Escribe el nombre completo tal como figura en la certificación (mínimo 5 caracteres).' }
  if (nombre.length > LARGO_NOMBRE_LEGAL.max) return { ok: false, error: 'El nombre completo admite hasta 160 caracteres.' }
  return { ok: true, nombre }
}

// ---------------------------------------------------------------------------
// Identidad completa, tal como la usan el membrete y el pie de los documentos
// ---------------------------------------------------------------------------

export type Identidad = {
  copropiedadId: string
  /** Nombre corto de menús ("Álamos 23"). */
  nombre: string
  /** Nombre completo legal ("Edificio Álamos 23 Propiedad Horizontal"). */
  nombreLegal: string | null
  nit: string | null
  celular: string | null
  direccion: string
  ciudad: string
  correo: string
  telefono: string
  representanteLegal: string
  eslogan: string
  colorPrimario: string
  colorSecundario: string
  prefijo: string
  logoRuta: string | null
  /** URL firmada y temporal del logo (o una vista previa local). */
  logoUrl: string | null
}

export type DatoIdentidad = 'logo' | 'nombre completo' | 'NIT' | 'celular'

/** Datos de identidad que faltan, en el orden en que se piden. */
export function faltantesIdentidad(i: Pick<Identidad, 'logoRuta' | 'nombreLegal' | 'nit' | 'celular'>): DatoIdentidad[] {
  const f: DatoIdentidad[] = []
  if (!i.logoRuta) f.push('logo')
  if (!i.nombreLegal) f.push('nombre completo')
  if (!i.nit) f.push('NIT')
  if (!i.celular) f.push('celular')
  return f
}

/** "logo, NIT y celular". */
export function listarEnEspanol(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_MAX_LADO = 512
export const LOGO_TIPOS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
} as const
export type TipoLogo = keyof typeof LOGO_TIPOS

const empiezaCon = (b: Uint8Array, firma: number[], desde = 0) => firma.every((x, i) => b[desde + i] === x)

/**
 * Revisa un logo antes de guardarlo: tipo permitido, tamaño máximo y que el
 * contenido corresponda de verdad al tipo declarado. Los SVG con código activo se rechazan.
 */
export function validarLogo(tipo: string, bytes: Uint8Array): { ok: true; extension: string } | { ok: false; error: string } {
  if (!(tipo in LOGO_TIPOS)) return { ok: false, error: 'El logo debe ser una imagen PNG, JPG, WEBP o SVG.' }
  if (bytes.byteLength === 0) return { ok: false, error: 'El archivo del logo está vacío.' }
  if (bytes.byteLength > LOGO_MAX_BYTES) return { ok: false, error: 'El logo no puede pesar más de 2 MB.' }
  const t = tipo as TipoLogo
  let coincide = false
  if (t === 'image/png') coincide = empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  else if (t === 'image/jpeg') coincide = empiezaCon(bytes, [0xff, 0xd8, 0xff])
  else if (t === 'image/webp') coincide = empiezaCon(bytes, [0x52, 0x49, 0x46, 0x46]) && empiezaCon(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  else {
    const texto = new TextDecoder().decode(bytes)
    coincide = /<svg[\s>]/i.test(texto)
    if (coincide && /<script|javascript:|\son[a-z]+\s*=|<foreignObject/i.test(texto)) {
      return { ok: false, error: 'El SVG contiene código o elementos no permitidos. Exporta el logo como PNG.' }
    }
  }
  if (!coincide) return { ok: false, error: 'El contenido del archivo no corresponde a una imagen válida.' }
  return { ok: true, extension: LOGO_TIPOS[t] }
}
