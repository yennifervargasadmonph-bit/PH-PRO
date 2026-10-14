'use server'
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/datos'
import { tokenValido } from '@/lib/invitaciones'

export type Estado = { error?: string }

const NO_VALIDA = 'La invitación no es válida, ya se usó, venció o es para otro correo. Pide una nueva a la administración.'

export async function aceptarInvitacion(token: string, _: Estado): Promise<Estado> {
  if (!tokenValido(token)) return { error: NO_VALIDA }
  const { supabase } = await usuarioActual()
  const { error } = await supabase.rpc('aceptar_invitacion', { p_token: token })
  if (error) return { error: NO_VALIDA }
  redirect('/central')
}
