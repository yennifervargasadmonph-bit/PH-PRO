import { z } from 'zod'
import { calcularDv, normalizarCelular, validarNit, validarNombreLegal } from './identidad'

/** Dígito de verificación de un NIT colombiano (algoritmo de la DIAN). */
export const digitoVerificacion = calcularDv

/**
 * Normaliza un NIT a la forma "900123456-8". Acepta puntos, espacios y guion.
 * Si no trae dígito de verificación lo calcula; si lo trae, lo valida.
 */
export function normalizarNit(entrada: string): string | null {
  const r = validarNit(entrada)
  return r.ok ? r.nit : null
}

const nitOpcional = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    const r = validarNit(v)
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.error })
      return z.NEVER
    }
    return r.nit
  })

const nitObligatorio = z
  .string({ error: 'Escribe el NIT de la copropiedad.' })
  .trim()
  .min(1, 'Escribe el NIT de la copropiedad.')
  .transform((v, ctx) => {
    const r = validarNit(v)
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.error })
      return z.NEVER
    }
    return r.nit
  })

const nombreLegal = z
  .string({ error: 'Escribe el nombre completo de la copropiedad.' })
  .transform((v, ctx) => {
    const r = validarNombreLegal(v)
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.error })
      return z.NEVER
    }
    return r.nombre
  })

const celular = z
  .string({ error: 'Escribe el celular de la administración.' })
  .transform((v, ctx) => {
    const c = normalizarCelular(v)
    if (!c) {
      ctx.addIssue({ code: 'custom', message: 'Escribe un celular colombiano de 10 dígitos que empiece por 3, por ejemplo 300 123 4567.' })
      return z.NEVER
    }
    return c
  })

/** Datos de identidad obligatorios de una copropiedad (el logo puede llegar después). */
export const esquemaIdentidad = z.object({
  nombre_legal: nombreLegal,
  nit: nitObligatorio,
  celular,
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
  nombre: z.string().trim().min(2, 'Escribe el nombre corto de la copropiedad.').max(160),
  ...esquemaIdentidad.shape,
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
