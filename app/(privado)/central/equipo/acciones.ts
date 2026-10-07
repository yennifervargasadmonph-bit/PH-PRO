'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { usuarioActual } from '@/lib/datos'
import { ROLES_COPROPIEDAD } from '@/lib/roles'

export type Estado = { error?: string; ok?: string }

export async function agregarMiembro(organizacionId: string, _: Estado, f: FormData): Promise<Estado> {
  const correo = z.email().safeParse(String(f.get('correo') ?? '').trim())
  if (!correo.success) return { error: 'Escribe un correo válido.' }
  const rol = f.get('rol') === 'administrador' ? 'administrador' : 'miembro'
  const { supabase } = await usuarioActual()
  const { error } = await supabase.rpc('agregar_miembro', { p_org: organizacionId, p_correo: correo.data, p_rol: rol })
  if (error) {
    if (error.code === 'P0002') return { error: 'Esa persona todavía no tiene cuenta. Créala primero en Supabase (Authentication > Users > Invite user).' }
    return { error: 'No pudimos agregar a esa persona.' }
  }
  revalidatePath('/central/equipo')
  return { ok: `${correo.data} ya hace parte del equipo.` }
}

export async function asignarAcceso(_: Estado, f: FormData): Promise<Estado> {
  const datos = z
    .object({
      usuario_id: z.uuid(),
      copropiedad_id: z.uuid(),
      rol: z.enum(Object.keys(ROLES_COPROPIEDAD) as [keyof typeof ROLES_COPROPIEDAD, ...(keyof typeof ROLES_COPROPIEDAD)[]]),
    })
    .safeParse(Object.fromEntries(f))
  if (!datos.success) return { error: 'Elige la persona, la copropiedad y el rol.' }
  const { supabase } = await usuarioActual()
  const { error } = await supabase.from('accesos_copropiedad').upsert(datos.data, { onConflict: 'copropiedad_id,usuario_id' })
  if (error) return { error: 'No pudimos asignar el acceso.' }
  revalidatePath('/central/equipo')
  return { ok: 'Acceso asignado.' }
}

export async function quitarAcceso(copropiedadId: string, usuarioId: string) {
  const { supabase } = await usuarioActual()
  await supabase.from('accesos_copropiedad').delete().eq('copropiedad_id', copropiedadId).eq('usuario_id', usuarioId)
  revalidatePath('/central/equipo')
}
