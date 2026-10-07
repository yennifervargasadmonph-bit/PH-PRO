import { z } from 'zod'
import { TIPOS_UNIDAD, leerNumero } from '@/lib/importacion/unidades'

const numeroCo = (mensaje: string) =>
  z.string().transform((v, ctx) => {
    const n = leerNumero(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: mensaje })
      return z.NEVER
    }
    return n
  })

export const esquemaUnidad = z.object({
  torre: z.string().trim().toUpperCase().max(20, 'La torre es demasiado larga.').default(''),
  numero: z.string().trim().toUpperCase().min(1, 'Escribe el número de la unidad.').max(20),
  tipo: z.enum(Object.keys(TIPOS_UNIDAD) as [keyof typeof TIPOS_UNIDAD, ...(keyof typeof TIPOS_UNIDAD)[]]),
  coeficiente: numeroCo('El coeficiente debe ser un número.').refine((n) => n > 0 && n <= 100, 'El coeficiente debe ser mayor que 0 y como máximo 100 %.'),
  area_m2: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null
      const n = leerNumero(v)
      if (n === null || n <= 0) {
        ctx.addIssue({ code: 'custom', message: 'El área no es válida.' })
        return z.NEVER
      }
      return n
    }),
  matricula_inmobiliaria: z.string().trim().max(30, 'La matrícula es demasiado larga.').default(''),
})

export type Unidad = {
  id: string
  copropiedad_id: string
  torre: string
  numero: string
  tipo: keyof typeof TIPOS_UNIDAD
  coeficiente: string
  area_m2: string | null
  matricula_inmobiliaria: string
  activa: boolean
}

export const nombreUnidad = (u: { torre: string; numero: string }) => (u.torre ? `T${u.torre} · ${u.numero}` : u.numero)
