'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { usuarioActual } from '@/lib/datos'
import { datosFormulario } from '@/lib/validacion'

export type Estado = { error?: string; ok?: string }

const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Elige un color válido.')
const esquema = z.object({
  color_primario: color,
  color_secundario: color,
  representante_legal: z.string().trim().max(120),
  correo: z.union([z.literal(''), z.email('Escribe un correo válido.')]),
  telefono: z.string().trim().max(40),
  eslogan: z.string().trim().max(120, 'El eslogan admite hasta 120 caracteres.'),
})

export async function guardarMarca(copropiedadId: string, _: Estado, f: FormData): Promise<Estado> {
  const datos = esquema.safeParse(datosFormulario(f))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const { supabase } = await usuarioActual()
  const { data, error } = await supabase.from('marcas_copropiedad').update(datos.data).eq('copropiedad_id', copropiedadId).select('copropiedad_id')
  if (error || !data?.length) return { error: 'No tienes permiso para cambiar la marca de esta copropiedad.' }
  revalidatePath(`/c/${copropiedadId}/marca`)
  return { ok: 'Datos de marca guardados.' }
}
