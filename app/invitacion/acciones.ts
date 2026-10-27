'use server'
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/datos'
import { LIMITES, consumir, mensajeLimite } from '@/lib/limite'
import { tokenValido } from '@/lib/invitaciones'

export type Estado = { error?: string }

const NO_VALIDA = 'La invitación no es válida, ya se usó, venció o es para otro correo. Pide una nueva a la administración.'

export async function aceptarInvitacion(token: string, _: Estado): Promise<Estado> {
  if (!tokenValido(token)) return { error: NO_VALIDA }
  const { supabase, usuario } = await usuarioActual()
  const limite = await consumir(`aceptar-invitacion:usuario:${usuario.id}`, LIMITES.aceptarInvitacionUsuario)
  if (!limite.permitido) return { error: mensajeLimite(limite) }
  const { error } = await supabase.rpc('aceptar_invitacion', { p_token: token })
  if (error) return { error: NO_VALIDA }
  redirect('/central')
}
