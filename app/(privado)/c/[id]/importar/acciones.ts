'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { usuarioActual } from '@/lib/datos'
import { TIPOS_UNIDAD } from '@/lib/importacion/unidades'

const fila = z.object({
  torre: z.string().max(20),
  numero: z.string().min(1).max(20),
  tipo: z.enum(Object.keys(TIPOS_UNIDAD) as [keyof typeof TIPOS_UNIDAD, ...(keyof typeof TIPOS_UNIDAD)[]]),
  coeficiente: z.number().positive().max(100),
  area_m2: z.number().positive().nullable(),
  matricula_inmobiliaria: z.string().max(30),
})
const entrada = z.object({
  archivo: z.string().max(200),
  filas: z.array(fila).min(1).max(5000),
  rechazos: z.array(z.object({ fila: z.number(), motivo: z.string().max(200) })).max(5000),
})

export type Resultado = { error?: string; nuevas?: number; actualizadas?: number; sin_cambios?: number; rechazadas?: number }

/** Aplica la importación ya revisada. La base de datos vuelve a comprobar permisos y datos. */
export async function aplicarImportacion(copropiedadId: string, datos: unknown): Promise<Resultado> {
  const d = entrada.safeParse(datos)
  if (!d.success) return { error: 'Los datos de la importación no son válidos. Vuelve a cargar el archivo.' }
  const { supabase } = await usuarioActual()
  const { data, error } = await supabase
    .rpc('aplicar_importacion_unidades', {
      p_copro: copropiedadId,
      p_archivo: d.data.archivo,
      p_filas: d.data.filas,
      p_rechazos: d.data.rechazos,
    })
    .single<{ nuevas: number; actualizadas: number; sin_cambios: number; rechazadas: number }>()
  if (error) {
    if (error.code === '42501') return { error: 'Solo la administración puede aprobar importaciones.' }
    return { error: 'No pudimos aplicar la importación y no se guardó ningún cambio. Inténtalo de nuevo.' }
  }
  revalidatePath(`/c/${copropiedadId}`, 'layout')
  return data
}
