'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { usuarioActual } from '@/lib/datos'
import { MENSAJE_INVITACION, enlaceInvitacion } from '@/lib/invitaciones'
import { LIMITES, consumir, mensajeLimite } from '@/lib/limite'
import { ROLES_COPROPIEDAD } from '@/lib/roles'
import { FALTA_URL_SITIO, urlSitio } from '@/lib/sitio'

export type Estado = { error?: string; ok?: string; enlace?: string }

const rolCopropiedad = z.enum(Object.keys(ROLES_COPROPIEDAD) as [keyof typeof ROLES_COPROPIEDAD, ...(keyof typeof ROLES_COPROPIEDAD)[]])

/**
 * Invita a una persona al equipo (y opcionalmente a una copropiedad con un rol).
 * La respuesta es siempre la misma, tenga o no cuenta el correo. Como no hay correo
 * transaccional, la administración recibe el enlace para compartirlo.
 */
export async function invitarPersona(organizacionId: string, _: Estado, f: FormData): Promise<Estado> {
  if (!z.uuid().safeParse(organizacionId).success) return { error: 'No tienes permiso para invitar personas a esta organización.' }
  const sitio = urlSitio()
  if (!sitio) return { error: FALTA_URL_SITIO }
  const datos = z
    .object({
      correo: z.string().max(254, 'Escribe un correo válido.').pipe(z.email('Escribe un correo válido.')),
      rol: z.enum(['miembro', 'administrador']).catch('miembro'),
      copropiedad_id: z.union([z.literal(''), z.uuid()]).catch(''),
      rol_copropiedad: z.union([z.literal(''), rolCopropiedad]).catch(''),
    })
    .safeParse({
      correo: String(f.get('correo') ?? '').trim().toLowerCase(),
      rol: f.get('rol'),
      copropiedad_id: f.get('copropiedad_id') ?? '',
      rol_copropiedad: f.get('rol_copropiedad') ?? '',
    })
  if (!datos.success) return { error: datos.error.issues[0].message }
  const { correo, rol, copropiedad_id, rol_copropiedad } = datos.data
  const conCopropiedad = rol === 'miembro' && copropiedad_id !== ''
  if (conCopropiedad && !rol_copropiedad) return { error: 'Elige el rol en la copropiedad.' }

  const { supabase, usuario } = await usuarioActual()
  const limite = await consumir(`invitacion:usuario:${usuario.id}`, LIMITES.invitacionUsuario)
  if (!limite.permitido) return { error: mensajeLimite(limite) }
  const { data: token, error } = await supabase.rpc('invitar_persona', {
    p_org: organizacionId,
    p_correo: correo,
    p_rol: rol,
    p_copro: conCopropiedad ? copropiedad_id : null,
    p_rol_copro: conCopropiedad ? rol_copropiedad : null,
  })
  if (error || typeof token !== 'string') {
    if (error?.code === '42501') return { error: 'No tienes permiso para invitar personas a esta organización.' }
    return { error: 'No pudimos crear la invitación. Inténtalo de nuevo.' }
  }
  revalidatePath('/central/equipo')
  return { ok: MENSAJE_INVITACION, enlace: enlaceInvitacion(sitio, token) }
}

export async function revocarInvitacion(id: string) {
  if (!z.uuid().safeParse(id).success) return
  const { supabase } = await usuarioActual()
  await supabase.rpc('revocar_invitacion', { p_id: id })
  revalidatePath('/central/equipo')
}

export async function asignarAcceso(_: Estado, f: FormData): Promise<Estado> {
  const datos = z
    .object({ usuario_id: z.uuid(), copropiedad_id: z.uuid(), rol: rolCopropiedad })
    .safeParse(Object.fromEntries(f))
  if (!datos.success) return { error: 'Elige la persona, la copropiedad y el rol.' }
  const { supabase } = await usuarioActual()
  const { error } = await supabase.from('accesos_copropiedad').upsert(datos.data, { onConflict: 'copropiedad_id,usuario_id' })
  if (error) return { error: 'No pudimos asignar el acceso.' }
  revalidatePath('/central/equipo')
  return { ok: 'Acceso asignado.' }
}

export async function quitarAcceso(copropiedadId: string, usuarioId: string) {
  if (!z.uuid().safeParse(copropiedadId).success || !z.uuid().safeParse(usuarioId).success) return
  const { supabase } = await usuarioActual()
  await supabase.from('accesos_copropiedad').delete().eq('copropiedad_id', copropiedadId).eq('usuario_id', usuarioId)
  revalidatePath('/central/equipo')
}
