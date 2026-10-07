'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { crearClienteServidor } from '@/lib/supabase/server'
import { destinoSeguro } from '@/lib/sesion'

export type EstadoFormulario = { error?: string; ok?: string }

const esquema = z.object({
  correo: z.email('Escribe un correo válido.'),
  clave: z.string().min(1, 'Escribe tu contraseña.'),
  siguiente: z.string().optional(),
})

export async function ingresar(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const datos = esquema.safeParse(Object.fromEntries(formulario))
  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email: datos.data.correo, password: datos.data.clave })
  if (error) {
    // Mensaje genérico: no revela si el correo existe.
    if (error.status === 429) return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
    return { error: 'El correo o la contraseña no coinciden.' }
  }
  redirect(destinoSeguro(datos.data.siguiente))
}

export async function recuperar(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const correo = z.email().safeParse(formulario.get('correo'))
  if (!correo.success) return { error: 'Escribe un correo válido.' }
  const supabase = await crearClienteServidor()
  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  await supabase.auth.resetPasswordForEmail(correo.data, {
    redirectTo: `${sitio}/auth/confirmar?siguiente=/nueva-clave`,
  })
  // Siempre la misma respuesta, exista o no la cuenta.
  return { ok: 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.' }
}
