'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { crearClienteServidor } from '@/lib/supabase/server'
import { tokenCaptcha } from '@/lib/captcha'
import { cookieActividad, destinoSeguro } from '@/lib/sesion'

export type EstadoFormulario = { error?: string; ok?: string }

const esquema = z.object({
  correo: z.email('Escribe un correo válido.'),
  clave: z.string().min(1, 'Escribe tu contraseña.'),
  siguiente: z.string().optional(),
})

export async function ingresar(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const datos = esquema.safeParse(Object.fromEntries(formulario))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const captcha = tokenCaptcha(formulario)
  if (captcha.error) return { error: captcha.error }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword({
    email: datos.data.correo,
    password: datos.data.clave,
    options: { captchaToken: captcha.token },
  })
  if (error) {
    // Mensaje genérico: no revela si el correo existe.
    if (error.status === 429) return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
    if (error.code === 'captcha_failed') return { error: 'La verificación de seguridad falló. Inténtalo de nuevo.' }
    return { error: 'El correo o la contraseña no coinciden.' }
  }
  // Empieza a contar la inactividad desde el ingreso (sin esta marca el proxy cierra la sesión).
  const almacen = await cookies()
  almacen.set(cookieActividad(process.env.NODE_ENV === 'production'))
  redirect(destinoSeguro(datos.data.siguiente))
}

export async function recuperar(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const correo = z.email().safeParse(formulario.get('correo'))
  if (!correo.success) return { error: 'Escribe un correo válido.' }
  const captcha = tokenCaptcha(formulario)
  if (captcha.error) return { error: captcha.error }
  const supabase = await crearClienteServidor()
  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { error } = await supabase.auth.resetPasswordForEmail(correo.data, {
    redirectTo: `${sitio}/auth/confirmar?siguiente=/nueva-clave`,
    captchaToken: captcha.token,
  })
  // Un CAPTCHA rechazado sí se informa (no revela nada sobre la cuenta).
  if (error?.code === 'captcha_failed') return { error: 'La verificación de seguridad falló. Inténtalo de nuevo.' }
  // Siempre la misma respuesta, exista o no la cuenta.
  return { ok: 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.' }
}
