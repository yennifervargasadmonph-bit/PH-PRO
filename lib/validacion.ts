import { z } from 'zod'

const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

/** Dígito de verificación de un NIT colombiano (algoritmo de la DIAN). */
export function digitoVerificacion(numero: string) {
  const digitos = numero.replace(/\D/g, '')
  if (!digitos || digitos.length > PESOS_NIT.length) throw new Error('NIT inválido')
  let suma = 0
  for (let i = 0; i < digitos.length; i++) {
    suma += Number(digitos[digitos.length - 1 - i]) * PESOS_NIT[i]
  }
  const residuo = suma % 11
  return residuo > 1 ? 11 - residuo : residuo
}

/**
 * Normaliza un NIT a la forma "900123456-1". Acepta puntos, espacios y guion.
 * Si no trae dígito de verificación lo calcula; si lo trae, lo valida.
 */
export function normalizarNit(entrada: string): string | null {
  const limpio = entrada.replace(/[.\s]/g, '')
  const m = limpio.match(/^(\d{6,12})(?:-?(\d))?$/)
  if (!m) return null
  const [, numero, dv] = m
  const calculado = digitoVerificacion(numero)
  if (dv !== undefined && Number(dv) !== calculado) return null
  return `${numero}-${calculado}`
}

const nitOpcional = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    const n = normalizarNit(v)
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'El NIT no es válido o su dígito de verificación no coincide.' })
      return z.NEVER
    }
    return n
  })

export const esquemaOrganizacion = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre de la organización.').max(160),
  nit: nitOpcional,
})

export const TIPOS_COPROPIEDAD = {
  edificio: 'Edificio',
  conjunto: 'Conjunto residencial',
  urbanizacion: 'Urbanización',
  centro_comercial: 'Centro comercial',
  mixta: 'Uso mixto',
} as const

export const esquemaCopropiedad = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre de la copropiedad.').max(160),
  nit: nitOpcional,
  tipo: z.enum(Object.keys(TIPOS_COPROPIEDAD) as [keyof typeof TIPOS_COPROPIEDAD, ...(keyof typeof TIPOS_COPROPIEDAD)[]]),
  ciudad: z.string().trim().max(80).default(''),
  direccion: z.string().trim().max(160).default(''),
  prefijo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, 'El prefijo debe tener de 2 a 6 letras o números, sin espacios.'),
})

/** Propone un prefijo documental a partir del nombre ("Edificio Álamos 23" -> "A23"). */
export function sugerirPrefijo(nombre: string) {
  const genericas = new Set(['EDIFICIO', 'CONJUNTO', 'RESIDENCIAL', 'URBANIZACION', 'CENTRO', 'COMERCIAL', 'TORRE', 'TORRES', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'PH', 'P.H.'])
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p && !genericas.has(p))
  const pref = palabras.map((p) => (/^\d+$/.test(p) ? p : p[0])).join('').slice(0, 6)
  return pref.length >= 2 ? pref : (palabras[0] ?? 'CP').slice(0, 3).padEnd(2, 'X')
}

/** Convierte FormData en objeto plano para validarlo con zod. */
export const datosFormulario = (f: FormData) => Object.fromEntries(f.entries()) as Record<string, string>
