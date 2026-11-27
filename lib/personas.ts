import { z } from 'zod'
import { formatearCelular, normalizarCelular } from './identidad'

// Personas vinculadas a unidades y autorización de datos (Ley 1581 de 2012).
// Sin dependencias del servidor: lo usan las páginas, las acciones y las pruebas.

export const TIPOS_VINCULO = {
  propietario: 'Propietario',
  residente: 'Residente',
  arrendatario: 'Arrendatario',
  apoderado: 'Apoderado',
  autorizado: 'Autorizado',
} as const
export type TipoVinculo = keyof typeof TIPOS_VINCULO

export const TIPOS_DOCUMENTO = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  TI: 'Tarjeta de identidad',
  PA: 'Pasaporte',
  PPT: 'Permiso por protección temporal',
  NIT: 'NIT',
  otro: 'Otro documento',
} as const
export type TipoDocumento = keyof typeof TIPOS_DOCUMENTO

/** Canal por el que se obtuvo (o se revocó) la autorización. */
export const CANALES = {
  escrito: 'Documento firmado',
  formulario_web: 'Formulario web',
  correo: 'Correo electrónico',
  whatsapp: 'WhatsApp',
  verbal_grabada: 'Verbal con grabación',
} as const
export type Canal = keyof typeof CANALES

export const FINALIDADES = {
  administracion: 'Administración de la copropiedad (Ley 675 y reglamento)',
  comunicaciones: 'Comunicaciones y citaciones',
  cobranza: 'Gestión de cartera',
  seguridad: 'Control de acceso y seguridad',
} as const
export type Finalidad = keyof typeof FINALIDADES

export type Persona = {
  id: string
  copropiedad_id: string
  tipo_persona: 'natural' | 'juridica'
  nombre: string
  activa: boolean
  conservar_hasta: string | null
}

export type DatosPersona = {
  persona_id: string
  tipo_documento: TipoDocumento | null
  numero_documento: string | null
  correo: string | null
  celular: string | null
  telefono: string | null
}

export type Vinculo = {
  id: string
  unidad_id: string
  persona_id: string
  tipo: TipoVinculo
  es_titular: boolean
  reside: boolean
  desde: string | null
  hasta: string | null
}

export type Autorizacion = {
  id: string
  persona_id: string
  politica_id: string
  canal: Canal
  otorgada_en: string
  finalidades: Finalidad[]
  registrada_en: string
  revocada_en: string | null
  revocacion_canal: Canal | null
}

export type Politica = {
  id: string
  version: string
  vigente_desde: string
  meses_conservacion: number
  texto: string
  creado_en: string
}

/** Fecha de hoy en Colombia (AAAA-MM-DD). */
export const hoyColombia = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora)

/** Un vínculo está vigente si ya empezó (o no se sabe cuándo) y no ha terminado. */
export function vinculoVigente(v: Pick<Vinculo, 'desde' | 'hasta'>, hoy = hoyColombia()) {
  return (!v.desde || v.desde <= hoy) && (!v.hasta || v.hasta >= hoy)
}

export type EstadoAutorizacion = 'vigente' | 'revocada' | 'sin'

/** Estado de la autorización de una persona: basta una autorización sin revocar. */
export function estadoAutorizacion(autorizaciones: Pick<Autorizacion, 'revocada_en'>[]): EstadoAutorizacion {
  if (autorizaciones.some((a) => !a.revocada_en)) return 'vigente'
  return autorizaciones.length ? 'revocada' : 'sin'
}

export const TEXTO_AUTORIZACION: Record<EstadoAutorizacion, string> = {
  vigente: 'Autorización vigente',
  revocada: 'Autorización revocada',
  sin: 'Sin autorización registrada',
}

/** Punto de estado: rojo si revocó, ámbar si falta la autorización. */
export const puntoAutorizacion = (e: EstadoAutorizacion) => (e === 'revocada' ? 'rojo' : e === 'sin' ? 'ambar' : null)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «2026-01-15» → «15 ene 2026» (sin pasar por zonas horarias). */
export function fechaCorta(iso: string | null | undefined) {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`
}

/** Periodo de un vínculo para una línea de meta. Lo que no se sabe se dice. */
export function periodo(v: Pick<Vinculo, 'desde' | 'hasta'>) {
  const desde = fechaCorta(v.desde)
  const hasta = fechaCorta(v.hasta)
  if (!desde && !hasta) return 'Fechas: dato faltante'
  if (!hasta) return `Desde ${desde ?? 'fecha faltante'}`
  return `${desde ?? 'Fecha faltante'} – ${hasta}`
}

export const formatearTelefono = (t: string) => (t.length === 10 && t.startsWith('3') ? formatearCelular(t) : t)

// ---------------------------------------------------------------------------
// Validación de formularios
// ---------------------------------------------------------------------------

const fecha = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
      ctx.addIssue({ code: 'custom', message: 'La fecha no es válida.' })
      return z.NEVER
    }
    return v
  })

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)

export const esquemaPersona = z
  .object({
    nombre: z.string().trim().min(2, 'Escribe el nombre completo.').max(160, 'El nombre es demasiado largo.'),
    tipo_persona: z.enum(['natural', 'juridica']).default('natural'),
    tipo_documento: z
      .union([z.enum(Object.keys(TIPOS_DOCUMENTO) as [TipoDocumento, ...TipoDocumento[]]), z.literal('')])
      .default('')
      .transform((v) => v || null),
    numero_documento: opcional(30).transform((v, ctx) => {
      if (!v) return null
      const limpio = v.replace(/[\s.]/g, '').toUpperCase()
      if (!/^[0-9A-Z-]{3,20}$/.test(limpio)) {
        ctx.addIssue({ code: 'custom', message: 'El número de documento solo lleva letras, números o guion (3 a 20).' })
        return z.NEVER
      }
      return limpio
    }),
    correo: opcional(160).pipe(z.union([z.null(), z.email('El correo no es válido.')])),
    celular: opcional(20).transform((v, ctx) => {
      if (!v) return null
      const c = normalizarCelular(v)
      if (!c) {
        ctx.addIssue({ code: 'custom', message: 'Escribe un celular colombiano de 10 dígitos que empiece por 3.' })
        return z.NEVER
      }
      return c
    }),
    telefono: opcional(20).transform((v, ctx) => {
      if (!v) return null
      const t = v.replace(/\D/g, '')
      if (!/^[0-9]{7,10}$/.test(t)) {
        ctx.addIssue({ code: 'custom', message: 'El teléfono fijo debe tener de 7 a 10 dígitos.' })
        return z.NEVER
      }
      return t
    }),
  })
  .refine((p) => !p.numero_documento || p.tipo_documento, { message: 'Elige el tipo de documento.' })
  .refine((p) => !p.tipo_documento || p.numero_documento, { message: 'Escribe el número de documento.' })

export const esquemaVinculo = z
  .object({
    tipo: z.enum(Object.keys(TIPOS_VINCULO) as [TipoVinculo, ...TipoVinculo[]], { error: 'Elige el tipo de vínculo.' }),
    es_titular: z.string().optional().transform((v) => v === 'on'),
    reside: z.string().optional().transform((v) => v === 'on'),
    desde: fecha.default(''),
    hasta: fecha.default(''),
  })
  .refine((v) => !v.es_titular || v.tipo === 'propietario', { message: 'Solo un propietario puede ser titular de la unidad.' })
  .refine((v) => !v.desde || !v.hasta || v.hasta >= v.desde, { message: 'La fecha de fin no puede ser anterior a la de inicio.' })

export const esquemaAutorizacion = z.object({
  politica_id: z.uuid({ error: 'Elige la versión de la política.' }),
  canal: z.enum(Object.keys(CANALES) as [Canal, ...Canal[]], { error: 'Elige el canal.' }),
  otorgada_en: fecha.refine((v) => v !== null, 'Escribe la fecha de la autorización.').refine((v) => !v || v <= hoyColombia(), 'La fecha no puede ser futura.'),
  finalidades: z
    .array(z.enum(Object.keys(FINALIDADES) as [Finalidad, ...Finalidad[]]))
    .min(1, 'Marca al menos una finalidad.'),
})

export const esquemaRevocacion = z.object({
  revocada_en: fecha.refine((v) => v !== null, 'Escribe la fecha de la revocación.').refine((v) => !v || v <= hoyColombia(), 'La fecha no puede ser futura.'),
  revocacion_canal: z.enum(Object.keys(CANALES) as [Canal, ...Canal[]], { error: 'Elige el canal.' }),
})

export const esquemaPolitica = z.object({
  version: z.string().trim().regex(/^[0-9A-Za-z._-]{1,20}$/, 'La versión lleva de 1 a 20 letras, números, punto o guion (por ejemplo 1.0).'),
  vigente_desde: fecha.refine((v) => v !== null, 'Escribe desde cuándo rige.'),
  meses_conservacion: z.coerce
    .number({ error: 'Escribe el plazo en meses.' })
    .int('El plazo es un número entero de meses.')
    .min(1, 'El plazo mínimo es 1 mes.')
    .max(600, 'El plazo máximo es 600 meses.'),
  texto: z.string().trim().min(50, 'Pega el texto completo de la política (al menos 50 caracteres).').max(50000),
})
